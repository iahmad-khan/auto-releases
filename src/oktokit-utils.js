const semver = require("semver");
const core = require("@actions/core");

async function isHotfix(activeBranch, devBranch, candidateBranch, releaseBranch, octokit, owner, repo) {
    core.info(`=== Starting isHotfix check ===`);
    core.info(`Active branch: ${activeBranch}`);
    core.info(`Dev branch: ${devBranch}`);
    core.info(`Candidate branch: ${candidateBranch}`);
    core.info(`Release branch: ${releaseBranch}`);
    core.info(`Repository: ${owner}/${repo}`);

    try {
        // Case 1: If active branch is the dev branch (e.g. main/next)
        if (activeBranch === devBranch) {
            core.info(`✅ Case 1: Active branch is dev branch`);
            core.info(`Result: isHotfix=true, previousBuild=null`);
            return { isHotfix: true, previousBuild: null };
        }

        // Case 2: If active branch is the candidate branch
        if (activeBranch === candidateBranch) {
            core.info(`🔍 Case 2: Active branch is candidate`);
            core.info(`Getting latest commit from dev branch (${devBranch})...`);

            const { data: devBranchData } = await octokit.rest.repos.getBranch({
                owner,
                repo,
                branch: devBranch
            });
            const previousBuild = `main-${devBranchData.commit.sha.substring(0, 7)}`;
            const fullHash = devBranchData.commit.sha;

            core.info(`Dev branch latest commit: ${fullHash}`);
            core.info(`Previous build (7-char): ${previousBuild}`);
            core.info(`Dev branch commit message: ${devBranchData.commit.commit.message.split('\n')[0]}`);

            core.info(`🔄 Performing bidirectional comparison...`);

            // Direction 1: candidate (base) → dev (head) — check if dev has new changes
            core.info(`📊 Direction 1: Comparing ${candidateBranch} (base) with ${devBranch} (head)...`);
            const { data: comparison1 } = await octokit.rest.repos.compareCommits({
                owner,
                repo,
                base: candidateBranch,
                head: devBranch
            });

            core.info(`Direction 1 results:`);
            core.info(`- Status: ${comparison1.status}`);
            core.info(`- Ahead by: ${comparison1.ahead_by} commits`);
            core.info(`- Behind by: ${comparison1.behind_by} commits`);
            core.info(`- Total commits: ${comparison1.total_commits}`);
            core.info(`- Files changed: ${comparison1.files?.length || 0}`);

            // Direction 2: dev (base) → candidate (head) — check if candidate has new changes
            core.info(`📊 Direction 2: Comparing ${devBranch} (base) with ${candidateBranch} (head)...`);
            const { data: comparison2 } = await octokit.rest.repos.compareCommits({
                owner,
                repo,
                base: devBranch,
                head: candidateBranch
            });

            core.info(`Direction 2 results:`);
            core.info(`- Status: ${comparison2.status}`);
            core.info(`- Ahead by: ${comparison2.ahead_by} commits`);
            core.info(`- Behind by: ${comparison2.behind_by} commits`);
            core.info(`- Total commits: ${comparison2.total_commits}`);
            core.info(`- Files changed: ${comparison2.files?.length || 0}`);

            const devHasNewChanges = comparison1.files && comparison1.files.length > 0;
            const candidateHasNewChanges = comparison2.files && comparison2.files.length > 0;

            core.info(`🔍 Bidirectional analysis:`);
            core.info(`- Dev has changes not in candidate: ${devHasNewChanges}`);
            core.info(`- Candidate has changes not in dev: ${candidateHasNewChanges}`);

            if (devHasNewChanges || candidateHasNewChanges) {
                core.info(`🚨 Differences detected in bidirectional comparison:`);

                if (devHasNewChanges) {
                    comparison1.files.forEach((file, index) => {
                        core.info(`  ${index + 1}. ${file.filename} (${file.status}) - +${file.additions} -${file.deletions}`);
                    });
                }

                if (candidateHasNewChanges) {
                    comparison2.files.forEach((file, index) => {
                        core.info(`  ${index + 1}. ${file.filename} (${file.status}) - +${file.additions} -${file.deletions}`);
                    });
                }

                core.info(`✅ Result: isHotfix=true, previousBuild=${previousBuild}`);
                return { isHotfix: true, previousBuild };
            } else {
                core.info(`✅ No differences found in bidirectional comparison`);
                core.info(`Candidate and dev branches are in sync.`);
                core.info(`Result: isHotfix=false, previousBuild=${previousBuild}`);
                return { isHotfix: false, previousBuild };
            }
        }

        // Case 3: If active branch is the release branch
        if (activeBranch === releaseBranch) {
            core.info(`🔍 Case 3: Active branch is release`);
            core.info(`Comparing ${candidateBranch} (base) with ${releaseBranch} (head)...`);

            const { data: comparison } = await octokit.rest.repos.compareCommits({
                owner,
                repo,
                base: candidateBranch,
                head: releaseBranch
            });

            core.info(`Comparison results:`);
            core.info(`- Status: ${comparison.status}`);
            core.info(`- Ahead by: ${comparison.ahead_by} commits`);
            core.info(`- Behind by: ${comparison.behind_by} commits`);
            core.info(`- Total commits: ${comparison.total_commits}`);
            core.info(`- Files changed: ${comparison.files?.length || 0}`);

            if (comparison.files && comparison.files.length > 0) {
                comparison.files.forEach((file, index) => {
                    core.info(`  ${index + 1}. ${file.filename} (${file.status}) - +${file.additions} -${file.deletions}`);
                });

                core.info(`✅ Result: isHotfix=true, previousBuild=null`);
                return { isHotfix: true, previousBuild: null };
            } else {
                core.info(`✅ No differences found between ${candidateBranch} and ${releaseBranch}`);
                core.info(`Result: isHotfix=false, previousBuild=null`);
                return { isHotfix: false, previousBuild: null };
            }
        }

        // Default: unhandled branch
        core.info(`⚠️ Default case: Branch '${activeBranch}' not handled specifically`);
        core.info(`Result: isHotfix=true, previousBuild=null`);
        return { isHotfix: true, previousBuild: null };

    } catch (error) {
        core.error(`❌ Error in isHotfix check: ${error.message}`);
        core.error(`Error stack: ${error.stack}`);
        core.info(`Defaulting to: isHotfix=true, previousBuild=null`);
        return { isHotfix: true, previousBuild: null };
    } finally {
        core.info(`=== End isHotfix check ===`);
    }
}

async function parseTags(octokit, owner, repo) {
    const { data } = await octokit.rest.git.listMatchingRefs({
        owner,
        repo,
        ref: "tags/",
    });

    const tags = data.map((ref) => ref.ref.replace("refs/tags/", ""));
    const latestTagWithPreReleases = semver.maxSatisfying(tags, "*", {
        includePrerelease: true,
    });

    const latestTagWithoutPreReleases = semver.maxSatisfying(tags, "*", {
        includePrerelease: false,
    });

    return { tags, latestTagWithPreReleases, latestTagWithoutPreReleases };
}

module.exports = {
    isHotfix,
    parseTags
};
