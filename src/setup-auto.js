const core = require("@actions/core");
const io = require("@actions/io");
const tc = require("@actions/tool-cache");
const exec = require("shelljs.exec");

async function setupAutoCLI() {
    await io.mkdirP("/usr/local/bin/");

    const downloadPath = await tc.downloadTool(
        "https://github.com/intuit/auto/releases/download/v11.1.6/auto-linux.gz",
        "/usr/local/bin/auto-linux.gz"
    );

    core.debug(`File downloaded: ${downloadPath}`);

    exec(`gzip -d ${downloadPath} && mv /usr/local/bin/auto-linux /usr/local/bin/auto && chmod +x /usr/local/bin/auto`);
    exec("sudo apt-get update");
    exec("sudo add-apt-repository ppa:git-core/ppa");
    exec("sudo apt install git=1:2.34.1-1ubuntu1.10 git-man=1:2.34.1-1ubuntu1.10 -y --allow-downgrades");
    core.addPath("/usr/local/bin");
    core.info(`Setup finished for auto, version: ${exec("auto --version").stdout.trim()}`);
}

module.exports = { setupAutoCLI };
