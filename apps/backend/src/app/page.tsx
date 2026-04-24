export default function BackendRoot() {
  return (
    <main>
      <h1>Rehearsal API</h1>
      <p>Running. Routes:</p>
      <ul>
        <li><code>POST /api/scenarios</code></li>
        <li><code>GET /api/scenarios/:id</code></li>
        <li><code>POST /api/scenarios/:id/run</code></li>
        <li><code>POST /api/scenarios/:id/run-all</code></li>
        <li><code>GET /api/scenarios/:id/stream</code> (SSE)</li>
        <li><code>GET /api/health</code></li>
      </ul>
      <p>Frontend default: <code>http://localhost:3000</code></p>
    </main>
  );
}
