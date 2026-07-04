import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

export const fetchLevels = async () => (await api.get("/levels")).data;
export const fetchLevel = async (id) => (await api.get(`/levels/${id}`)).data;
export const postScore = async (payload) => (await api.post("/scores", payload)).data;
export const fetchScores = async (id) => (await api.get(`/scores/${id}`)).data;
export const uploadSong = async ({ levelId, durationSeconds, file }) => {
  const fd = new FormData();
  fd.append("level_id", levelId);
  fd.append("duration_seconds", String(durationSeconds));
  fd.append("file", file);
  return (await api.post("/songs/upload", fd, { headers: { "Content-Type": "multipart/form-data" } })).data;
};
export const deleteSong = async (levelId) => (await api.delete(`/songs/${levelId}`)).data;
