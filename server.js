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

app.get('/fetch-tiktok', (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).send('URL query parameter is required.');
    }

    // Extract the TikTok video ID from the URL
    const videoIdMatch = url.match(/\/video\/(\d+)/);
    if (!videoIdMatch) {
        return res.status(400).send('Invalid TikTok URL format.');
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
            return res.status(500).send('Error downloading video.');
        }

        console.log(`Video downloaded: ${stdout}`);

        // Convert the video to H.264 using ffmpeg
        exec(`ffmpeg -i "${tempPath}" -c:v libx264 -c:a aac -strict experimental "${outputPath}"`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error converting video to H.264: ${error.message}`);
                return res.status(500).send('Error converting video.');
            }

            console.log(`Video converted to H.264: ${stdout}`);

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
					console.log('tiktok file sent successfully');
                    res.json({ videoURL: `http://localhost:${port}/tiktok-proxy/${videoId}-encoded.mp4` });
                } else {
                    res.status(500).send('Error: Video file not found after conversion.');
                }
            }, 1000); // Wait for 1 second to ensure file operations complete
        });
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
