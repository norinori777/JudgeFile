import { createServer, type Server } from 'node:http';

/** ヘルスチェックレスポンスに含める現在の状態 */
export interface HealthStatus {
  queueSize: number;
}

/** startHealthServer の返却型 */
export interface HealthCheckServer {
  close(): void;
}

/**
 * オプション HTTP ヘルスチェックサーバーを起動する（FR-007, FR-008）。
 *
 * - GET /health → 200 {"status":"ok","queueSize":<n>,"uptimeMs":<n>}
 * - close() 後の GET /health → 503 {"status":"shutting_down",...}
 * - その他のパス → 404
 * - EADDRINUSE → エラーログを出してプロセスを終了する（FR-007, US5 Clarification Q5）
 * - すべてのレスポンスに X-Content-Type-Options: nosniff を付与する（OWASP T035）
 */
export function startHealthServer(
  port: number,
  getStatus: () => HealthStatus,
): HealthCheckServer {
  let isShuttingDown = false;
  const startTime = Date.now();

  const server: Server = createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method === 'GET' && req.url === '/health') {
      const status = getStatus();
      const uptimeMs = Date.now() - startTime;

      if (isShuttingDown) {
        const body = JSON.stringify({
          status: 'shutting_down',
          queueSize: status.queueSize,
          uptimeMs,
        });
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(body);
      } else {
        const body = JSON.stringify({
          status: 'ok',
          queueSize: status.queueSize,
          uptimeMs,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(body);
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  server.listen(port, () => {
    console.log(`[JudgeFile] ヘルスチェックサーバー起動: http://localhost:${port}/health`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[JudgeFile] エラー: ポート ${port} は既に使用中です。別のポートを設定するか、競合プロセスを終了してください。`,
      );
      process.exit(1);
    }
    // その他のエラーは上位に伝播させる
    throw err;
  });

  return {
    close(): void {
      isShuttingDown = true;
    },
  };
}
