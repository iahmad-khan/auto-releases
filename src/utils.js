const fs = require('fs');

function generateAutoRc({ mainBranch, releaseBranch, jiraUrl }) {
    const plugins = [];

    if (jiraUrl) {
        plugins.push(["jira", jiraUrl]);
    }

    plugins.push(["released", { label: ":rocket:" }]);

    return {
        prereleaseBranches: [mainBranch],
        baseBranch: releaseBranch,
        plugins,
        labels: [
            {
                releaseType: "major",
                name: "major",
            },
            {
                releaseType: "minor",
                name: "minor",
            },
            {
                releaseType: "patch",
                name: "patch",
            },
            {
                name: "docs",
                releaseType: "skip",
            },
            {
                name: "internal",
                releaseType: "skip",
            }
        ]
    };
}

function validateInputs(inputs) {
    Object.keys(inputs).forEach((key) => {
        if (typeof inputs[key] === "boolean") {
            return;
        }
        if (!inputs[key]) {
            throw new Error(`Validation failed for input ${key}`);
        }
        if (!inputs[key].length) {
            throw new Error(`Validation failed for input ${key}`);
        }
    });
}

async function writeFile(fileName, content) {
    await fs.promises.writeFile(fileName, JSON.stringify(content));
}

const fixLinks = (str) => {
    return str.replace(/\[([^\]]+)\]\(([^)]+)\):?/g, '<$2|$1>');
};

const getSlackPayload = (messagePayload, owner, repo, tag) => {
    const sectionBlocks = messagePayload.map(({ title, listItems }) => {
        return [
            {
                type: "section",
                text: {
                    type: "plain_text",
                    text: title,
                }
            },
            ...listItems.map((listItem) => {
                return {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: listItem
                    },
                };
            }),
        ];
    });

    const payload = {
        "attachments": [
            {
                "blocks": [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `<!here> - *:rocket: New release* has been published for *${owner}/${repo}* <https://github.com/${owner}/${repo}/releases/tag/${tag}|Release ${tag}>`
                        },
                    },
                    {
                        type: "divider"
                    },
                ]
            }
        ]
    };

    sectionBlocks.forEach(i => {
        i.forEach(k => {
            payload.attachments[0].blocks.push(k);
        });
    });
    return payload;
};

const formatSlackMessage = (content, owner, repo, tag) => {
    const sections = content.split(/\n#+ /);

    if (sections[0].trim() === '') {
        sections.shift();
    }

    const sectionObjects = [];

    sections.forEach((section) => {
        const firstNewLine = section.indexOf('\n');
        let title = firstNewLine === -1 ? section : section.substring(0, firstNewLine).trim();
        const body = firstNewLine === -1 ? '' : section.substring(firstNewLine).trim();

        title = title.replace(/#/g, '').trim();

        const listItems = body.split('\n')
            .filter(line => line.startsWith('- '))
            .map(line => line.substring(2))
            .map(fixLinks);

        sectionObjects.push({ title, listItems });
    });

    return getSlackPayload(sectionObjects, owner, repo, tag);
};

function getReleaseLabel({ labelStr, isPreReleaseBranch }) {
    const label = labelStr.trim().toLowerCase();
    let releaseType = "patch";

    if (label.includes("patch")) {
        releaseType = "patch";
    }
    if (label.includes("minor")) {
        releaseType = "minor";
    }
    if (label.includes("major")) {
        releaseType = "major";
    }
    return isPreReleaseBranch ? `pre${releaseType}` : releaseType;
}

module.exports = { validateInputs, generateAutoRc, writeFile, formatSlackMessage, getReleaseLabel };
