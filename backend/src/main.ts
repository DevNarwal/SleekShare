import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security Headers
  app.use(helmet());

  // Response Compression
  app.use(compression());

  // Enable Cookie Parsing
  app.use(cookieParser());

  // CORS Configuration
  app.enableCors({
    origin: true, // Allow all origins for dev, can restrict to client url in production
    credentials: true, // Essential for HttpOnly cookies
  });

  // Global Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // API Route Prefix
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running onport ${port}`);
}
bootstrap();
