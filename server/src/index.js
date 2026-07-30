import { createApp } from "./app.js";

const app = createApp();
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`fairaudit-server listening on http://localhost:${PORT}`);
});
