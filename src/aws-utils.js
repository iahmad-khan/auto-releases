const { ECRClient, DescribeImagesCommand } = require('@aws-sdk/client-ecr');
const core = require('@actions/core');

async function ecrImageExists({ region, repositoryName, imageTag, accessKeyId, secretAccessKey }) {
    try {
        const config = { region };

        if (accessKeyId && secretAccessKey) {
            config.credentials = { accessKeyId, secretAccessKey };
        }

        const ecr = new ECRClient(config);
        const command = new DescribeImagesCommand({
            repositoryName,
            imageIds: [{ imageTag }]
        });

        const result = await ecr.send(command);

        return result.imageDetails && result.imageDetails.length > 0;

    } catch (error) {
        if (error.name === 'ImageNotFoundException') {
            core.info(`Image ${imageTag} not found in repository ${repositoryName}`);
            return false;
        } else if (error.name === 'RepositoryNotFoundException') {
            core.info(`Repository ${repositoryName} not found`);
            return false;
        } else {
            core.error(`Error checking ECR image: ${error.message}`);
            return false;
        }
    }
}

module.exports = { ecrImageExists };
