const axios = require('axios');
const core = require('@actions/core');
const {formatSlackMessage} = require('./utils');

async function sendReleaseNotesToSlack(githubToken, slackToken, owner, repo, tag, channels) {
    try {
        // 1. Query GitHub API to get release by tag
        let releaseResponse = null;

        core.info(`Fetching release notes https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`);
        try {
            releaseResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, {
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                },
                timeout: 60000,
            });
        } catch (err) {
            core.error("Failed to fetch release notes for the tag!");
            core.info(err.request);
            core.info(err.response);
            core.info(err.message);
            throw err;
        }

        core.info(releaseResponse);
        core.info(releaseResponse.data.body);
        const releaseNotes = releaseResponse.data.body;

        // Capitalize the repo name
        const capitalizedRepo = repo.charAt(0).toUpperCase() + repo.slice(1);

        // Include the @here mention
        const titleMessage = `@here - New release from ${capitalizedRepo}!\n`;

        const sendToChannel = async (channel) => {
            let slackPayload;

            try {
                core.info("Sending message the by formatting it");
                slackPayload = {
                    channel: channel,
                    icon_emoji: ':rocket:',
                    username: owner,
                    ...formatSlackMessage(releaseNotes, owner, repo, tag),
                };

            } catch (e) {
                core.info("Failed to format slack message");
                core.info(e);
                slackPayload = {
                    text: titleMessage + releaseNotes,
                    channel: channel,
                    icon_emoji: ':rocket:',
                    username: owner
                };
            }

            try {
                const response = await axios.post('https://slack.com/api/chat.postMessage', slackPayload, {
                    headers: {
                        'Authorization': `Bearer ${slackToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 60000,
                });

                if (response.status !== 200) {
                    core.info(JSON.stringify({
                        data: response.data,
                        status: response.status,
                        statusText: response.statusText,
                    }));
                }
            } catch (err) {
                core.error("Failed to send slack notification");
                core.error(err);
                core.info("Continuing without the slack message.");
            }
        };

        // 3. Send release notes to each Slack channel in parallel
        await Promise.all(channels.map(channel => sendToChannel(channel)));

        core.info('Release notes sent to Slack channels successfully!');

    } catch (error) {
        core.error(error.message);
        throw error;
    }
}

module.exports = sendReleaseNotesToSlack;
