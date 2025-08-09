const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const cors = require('cors');
const app = express();
const PORT = 3000;

// 🔐 Replace these with your Spotify credentials
const CLIENT_ID = '9abb82faf4de4d06a4cd98146cf84f93';
const CLIENT_SECRET = '2dffe1cca1e84a54905acc8026c2b028';

let accessToken = '';

app.use(cors({
  origin: '*',
}));

// Get Spotify Access Token using Client Credentials Flow
async function getAccessToken() {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const data = await response.json();
  accessToken = data.access_token;
}

// Search Deezer for preview URL by song name and artist
async function getDeezerPreview(name, artist) {
  const query = encodeURIComponent(`${name} ${artist}`);
  const url = `https://api.deezer.com/search?q=${query}&limit=1`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.data && data.data.length > 0 && data.data[0].preview) {
      return data.data[0].preview;  // 30s MP3 preview URL
    }
  } catch (err) {
    console.error('Deezer search error:', err);
  }
  return null;
}

// Get all tracks from Spotify playlist, then add Deezer preview URLs
app.get('/playlist/:id', async (req, res) => {
  const playlistId = req.params.id;

  if (!accessToken) {
    await getAccessToken();
  }

  let tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

  try {
    while (url) {
      const result = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const data = await result.json();

      if (data.error) {
        return res.status(data.error.status).json({ error: data.error.message });
      }

      for (const item of data.items) {
        const name = item.track.name;
        const artist = item.track.artists.map(a => a.name).join(', ');
        const deezerPreview = await getDeezerPreview(name, artist);

        tracks.push({
          name,
          artist,
          preview_url: deezerPreview,  // from Deezer
        });
      }

      url = data.next;
    }

    res.json(tracks);
  } catch (error) {
    console.error('Error fetching playlist tracks:', error);
    res.status(500).json({ error: 'Failed to fetch playlist tracks.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
