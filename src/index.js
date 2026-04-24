const core = require("@actions/core");
const github = require("@actions/github");

const semver = require("semver");
const exec = require("shelljs.exec");

const sendSlackNotifications = require("./slack-notify");
const setupAuto = require("./setup-auto");
const utils = require("./utils");
const awsUtils = require("./aws-utils");
const githubUtils = require("./oktokit-utils");

function getOctokitInstance() {
    const token = core.getInput("github-token", { required: true });

    return new github.getOctokit(token);
}

async function initializeInputs() {
    let appMatrix = core.getInput("appMatrix");
    let ecrRepository;

    if (appMatrix) {
        try {
            appMatrix = JSON.parse(appMatrix);
            if (appMatrix.length > 0) {
                ecrRepository = appMatrix[0].repository;
            }
        } catch (error) {
            core.error(`Error parsing appMatrix: ${error}`);
        }
    }
    return {
        appMatrix,
        ecrRepository,
        dryRun: core.getInput("dry-run").toLowerCase(),
        devBranch: core.getInput("dev-branch", { trimWhitespace: true }),
        mainBranch: core.getInput("main-branch"),
        releaseBranch: core.getInput("release-branch"),
        jiraUrl: core.getInput("jira-url"),
        slackToken: core.getInput("slack-token"),
        slackChannels: core.getInput("slack-channels").split(",").map((c) => c.trim()),
        notifyOnPreRelease: core.getInput("notify-on-pre-release") === "true",
        forcePatchRelease: core.getInput("force-patch-releases") === "true",
        registry: core.getInput("registry"),
        ecrAccessKey: core.getInput("ecrAccessKey"),
        ecrAccessSecret: core.getInput("ecrAccessSecret"),
        ecrRegion: core.getInput("ecrRegion"),
        octokit: getOctokitInstance(),
        owner: github.context.payload.repository.owner.login,
        repo: github.context.payload.repository.name,
    };
}

async function setupProj({ autorc }) {
    core.info("Installing dependencies...");
    await setupAuto.setupAutoCLI();
    await utils.writeFile(".autorc", autorc);
}

async function action() {
    try {
        const inputs = await initializeInputs();
        const activeBranch = github.context.ref.replace(/refs\/heads\//, "");

        utils.validateInputs({
            mainBranch: inputs.mainBranch,
            releaseBranch: inputs.releaseBranch,
            slackToken: inputs.slackToken,
            slackChannelsInput: inputs.slackChannels,
            notifyOnPreRelease: inputs.notifyOnPreRelease,
            repository: inputs.repo.toUpperCase(),
        });

        process.env["GH_TOKEN"] = core.getInput("github-token", { required: true });
        process.env["SLACK_TOKEN"] = inputs.slackToken;

        await setupProj({
            autorc: utils.generateAutoRc({
                mainBranch: inputs.mainBranch,
                releaseBranch: inputs.releaseBranch,
                jiraUrl: inputs.jiraUrl,
            }),
        });

        if (inputs.devBranch === activeBranch && inputs.releaseBranch !== inputs.devBranch) {
            core.setOutput("new-tag", `main-${github.context.sha.substring(0, 7)}`);
            core.setOutput("latestTagWithPreReleases", "N/A");
            core.setOutput("latestTagWithoutPreReleases", "N/A");
            core.setOutput("releaseType", "dev-release");
            core.setOutput("isHotfix", "true");
            return;
        }

        const { tags, latestTagWithPreReleases, latestTagWithoutPreReleases } = await githubUtils.parseTags(
            inputs.octokit,
            inputs.owner,
            inputs.repo
        );

        core.info(`Tags with pre-releases: ${latestTagWithPreReleases}`);
        core.info(`Tags without pre-releases: ${latestTagWithoutPreReleases}`);

        core.info(`🔧 === HOTFIX DETECTION PHASE ===`);
        let hotfixResult = { isHotfix: false, previousBuild: null };

        core.info(`📋 Branch Information:`);
        core.info(`- Active branch: ${activeBranch}`);
        core.info(`- Release branch: ${inputs.releaseBranch}`);
        core.info(`- Candidate branch: ${inputs.mainBranch}`);
        core.info(`- Dev branch: ${inputs.devBranch || 'N/A'}`);

        const relevantBranches = [inputs.devBranch, inputs.mainBranch, inputs.releaseBranch];

        core.info(`🎯 Relevant branches for hotfix detection: ${relevantBranches.join(', ')}`);
        core.info(`- Is active branch relevant? ${relevantBranches.includes(activeBranch)}`);

        if (activeBranch === inputs.mainBranch || activeBranch === inputs.releaseBranch) {
            core.info(`✅ Active branch is relevant - proceeding with hotfix check`);
            hotfixResult = await githubUtils.isHotfix(
                activeBranch,
                inputs.devBranch,
                inputs.mainBranch,
                inputs.releaseBranch,
                inputs.octokit,
                inputs.owner,
                inputs.repo
            );

            core.info(`📊 Hotfix Detection Results:`);
            core.info(`- Is Hotfix: ${hotfixResult.isHotfix}`);
            core.info(`- Previous Build: ${hotfixResult.previousBuild || 'N/A'}`);

            if (!hotfixResult.isHotfix && activeBranch === inputs.releaseBranch) {
                if (latestTagWithPreReleases === latestTagWithoutPreReleases) {
                    core.info(`🔍 No pre-releases found with latest tag, marking hotfix to true`);
                    hotfixResult.isHotfix = true;
                    hotfixResult.previousBuild = null;
                } else {
                    core.info(`🔍 Release branch is not a hotfix - setting previous build to ${latestTagWithPreReleases}`);
                    hotfixResult.previousBuild = latestTagWithPreReleases;
                }
            }
        } else {
            core.info(`⏭️ Active branch '${activeBranch}' is not relevant for hotfix detection - skipping`);
        }

        // ECR check: if not a hotfix and we have a previous build, verify the image exists
        if (!hotfixResult.isHotfix && hotfixResult.previousBuild) {
            if (inputs.ecrRepository) {
                core.info(`🔍 Checking if previous build image exists in ECR: ${hotfixResult.previousBuild}`);
                const imageExists = await awsUtils.ecrImageExists({
                    region: inputs.ecrRegion,
                    repositoryName: inputs.ecrRepository,
                    imageTag: hotfixResult.previousBuild,
                    accessKeyId: inputs.ecrAccessKey,
                    secretAccessKey: inputs.ecrAccessSecret
                });

                if (!imageExists) {
                    core.info(`❌ Image not found in ECR - forcing rebuild from scratch`);
                    hotfixResult.isHotfix = true;
                    hotfixResult.previousBuild = null;
                } else {
                    core.info(`✅ Image exists in ECR - previous build can be reused`);
                }
            } else {
                // No ECR configured: cannot verify image exists, fall back to rebuild
                core.info(`⚠️ ECR repository not configured - cannot verify previous build, forcing rebuild`);
                hotfixResult.isHotfix = true;
                hotfixResult.previousBuild = null;
            }
        }

        core.info(`🏷️ Setting GitHub Action outputs:`);
        core.setOutput("isHotfix", hotfixResult.isHotfix ? "true" : "false");
        core.setOutput("previousBuild", hotfixResult.previousBuild);
        core.info(`- isHotfix: ${hotfixResult.isHotfix ? "true" : "false"}`);
        core.info(`- previousBuild: ${hotfixResult.previousBuild || 'null'}`);
        core.info(`🔧 === END HOTFIX DETECTION PHASE ===`);

        if (![inputs.mainBranch, inputs.releaseBranch].includes(activeBranch)) {
            throw new Error(`Branch ${activeBranch} is not set for release or pre-release`);
        }

        const releaseType = activeBranch === inputs.mainBranch ? "pre-release" : "full-release";

        const releaseLabel = exec("auto label", { silent: true }).stdout;

        let semverVersionBump = utils.getReleaseLabel({
            labelStr: releaseLabel,
            isPreReleaseBranch: inputs.mainBranch === activeBranch
        });

        if (releaseType === "full-release") {
            semverVersionBump = semverVersionBump.replace("pre", "");
        }

        // Determine increment type: on pre-release branch, bump within the existing pre-release
        // series if one exists; otherwise start a new pre-release from the configured bump type.
        const isOnExistingPreRelease =
            releaseType === "pre-release" && semver.prerelease(latestTagWithPreReleases) !== null;

        const incrementType = isOnExistingPreRelease
            ? "prerelease"
            : inputs.forcePatchRelease
                ? "prepatch"
                : semverVersionBump;

        const preReleaseId = releaseType === "pre-release" ? "rc" : undefined;

        const nextVersion = semver.inc(latestTagWithPreReleases, incrementType, preReleaseId);

        if (!semver.valid(nextVersion)) {
            throw new Error(`Invalid next version calculated: ${nextVersion}`);
        }

        if (tags.includes(`v${nextVersion}`)) {
            throw new Error(`Version v${nextVersion} already exists`);
        }

        if (inputs.dryRun === "true") {
            core.info("Dry run: Tagging process skipped");
            return;
        }

        const autoRelease = exec(
            `npx auto release --from ${latestTagWithoutPreReleases} --use-version v${nextVersion}`
        );

        core.info(autoRelease);
        if (!autoRelease.ok) {
            throw new Error("Auto release failed");
        }

        core.setOutput("new-tag", `v${nextVersion}`);
        core.setOutput("latestTagWithPreReleases", latestTagWithPreReleases);
        core.setOutput("latestTagWithoutPreReleases", latestTagWithoutPreReleases);
        core.setOutput("releaseType", releaseType);

        if (inputs.notifyOnPreRelease) {
            try {
                await sendSlackNotifications(
                    core.getInput("github-token"),
                    inputs.slackToken,
                    inputs.owner,
                    inputs.repo,
                    `v${nextVersion}`,
                    inputs.slackChannels
                );
            } catch {
                core.warning("Error sending Slack notification, continuing...");
            }
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}

action();
