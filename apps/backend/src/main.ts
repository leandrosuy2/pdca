import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { createServer } from 'net';

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

async function isBackendAlreadyRunning(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  
  app.enableCors({
    origin: '*', // Adjust for production
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  const port = configService.get<number>('PORT') || 3001;
  const available = await isPortAvailable(port);
  if (!available) {
    const running = await isBackendAlreadyRunning(port);
    if (running) {
      console.log(
        `Backend ja esta ativo em http://localhost:${port}. Nenhuma nova instancia foi iniciada.`,
      );
      await app.close();
      return;
    }
    console.error(
      `Porta ${port} em uso por outro processo. Altere PORT no .env para subir o backend em outra porta.`,
    );
    await app.close();
    process.exit(1);
  }

  await app.listen(port);
  console.log(`Backend is running on: http://localhost:${port}`);
}
bootstrap();
