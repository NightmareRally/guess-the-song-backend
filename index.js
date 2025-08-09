const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const cors = require('cors');
const app = express();
const PORT = 3000;

// 🔐 Spotify credentials
const CLIENT_ID = '9abb82faf4de4d06a4cd98146cf84f93';
const CLIENT_SECRET = '2dffe1cca1e84a54905acc8026c2b028';

let accessToken = '';
let tokenExpiresAt = 0;

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

  if (data.access_token) {
    accessToken = data.access_token;
    // Expiry time (Spotify gives seconds, so multiply by 1000 for ms)
    tokenExpiresAt = Date.now() + (data.expires_in * 1000);
    console.log(`✅ New Spotify token acquired, expires in ${data.expires_in / 60} minutes`);
  } else {
    console.error("❌ Failed to get access token:", data);
  }
}

// Ensure token is always valid before making Spotify API call
async function ensureAccessToken() {
  if (!accessToken || Date.now() >= tokenExpiresAt) {
    await getAccessToken();
  }
}

// Search Deezer for preview URL
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

// Fetch playlist from Spotify with retries
async function fetchSpotifyPlaylist(playlistId) {
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
  let tracks = [];

  while (url) {
    const result = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (result.status === 401) {
      console.log("⚠ Token expired, refreshing...");
      await getAccessToken();
      return await fetchSpotifyPlaylist(playlistId); // Retry
    }

    const data = await result.json();
    if (data.error) {
      throw new Error(data.error.message);
    }

    for (const item of data.items) {
      const name = item.track.name;
      const artist = item.track.artists.map(a => a.name).join(', ');
      const deezerPreview = await getDeezerPreview(name, artist);

      tracks.push({
        name,
        artist,
        preview_url: deezerPreview,
      });
    }

    url = data.next;
  }

  return tracks;
}

// Route: Get playlist tracks
app.get('/playlist/:id', async (req, res) => {
  try {
    await ensureAccessToken();
    const playlistId = req.params.id;
    const tracks = await fetchSpotifyPlaylist(playlistId);
    res.json(tracks);
  } catch (error) {
    console.error('Error fetching playlist:', error);
    res.status(500).json({ error: 'Failed to fetch playlist tracks.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
