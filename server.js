const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000; // Choose your preferred port

// Serve video files from /tiktok-proxy directory
app.use('/tiktok-proxy', express.static(path.join(__dirname, 'tiktok-proxy')));
app.use(cors());

// Ensure the tiktok-proxy directory exists
const tiktokProxyDir = path.join(__dirname, 'tiktok-proxy');
if (!fs.existsSync(tiktokProxyDir)) {
    fs.mkdirSync(tiktokProxyDir);
}

let queue = [];
let isProcessing = false;

const processQueue = () => {
    if (queue.length === 0) {
        isProcessing = false;
        return;
    }

    isProcessing = true;
    const { url, res } = queue.shift();

    // Check if URL contains "tiktok"
    if (!url.includes('tiktok')) {
        res.status(400).send('URL must contain "tiktok".');
        processQueue();
        return;
    }

    // Extract the TikTok video ID from the URL
    const videoIdMatch = url.match(/\/video\/(\d+)/);
    if (!videoIdMatch) {
        res.status(400).send('Invalid TikTok URL format.');
        processQueue();
        return;
    }
    const videoId = videoIdMatch[1];

    const tempPath = path.join(tiktokProxyDir, `${videoId}.mp4`);
    const outputPath = path.join(tiktokProxyDir, `${videoId}-encoded.mp4`);

    // Delete old files if they exist
    if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
    }
    if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
    }

    // Download the video using yt-dlp
    exec(`yt-dlp -o "${tempPath}" ${url}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error downloading video: ${error.message}`);
            res.status(500).send('Error downloading video.');
            processQueue();
            return;
        }

        console.log(`Video downloaded: ${stdout}`);

        // Convert the video to H.264 using ffmpeg
        exec(`ffmpeg -i "${tempPath}" -c:v libx264 -c:a aac -strict experimental "${outputPath}"`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error converting video to H.264: ${error.message}`);
                res.status(500).send('Error converting video.');
                processQueue();
                return;
            }

            console.log(`Video converted to H.264: ${stdout}`);

            // Get video duration using ffprobe
            exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error getting video duration: ${error.message}`);
                    res.status(500).send('Error getting video duration.');
                    processQueue();
                    return;
                }

                const duration = parseFloat(stdout);
                console.log(`Video duration: ${duration} seconds`);

                // Delete the temporary mp4 file
                fs.unlink(tempPath, (err) => {
                    if (err) {
                        console.error(`Error deleting temp mp4 file: ${err.message}`);
                    } else {
                        console.log('Temporary mp4 file deleted.');
                    }
                });

                // Ensure the file is accessible
                setTimeout(() => {
                    if (fs.existsSync(outputPath)) {
                        console.log('TikTok file sent successfully');
                        res.json({ videoURL: `http://localhost:${port}/tiktok-proxy/${videoId}-encoded.mp4` });
                    } else {
                        res.status(500).send('Error: Video file not found after conversion.');
                    }

                    // Wait for the duration of the video before processing the next request
                    setTimeout(() => {
                        // Delete the encoded video file after it's done playing
                        fs.unlink(outputPath, (err) => {
                            if (err) {
                                console.error(`Error deleting encoded mp4 file: ${err.message}`);
                            } else {
                                console.log('Encoded mp4 file deleted.');
                            }
                        });

                        processQueue();
                    }, (duration + 1) * 1000); // Add 1 second buffer
                }, 1000); // Wait for 1 second to ensure file operations complete
            });
        });
    });
};

app.get('/fetch-tiktok', (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).send('URL query parameter is required.');
    }

    queue.push({ url, res });

    if (!isProcessing) {
        processQueue();
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
