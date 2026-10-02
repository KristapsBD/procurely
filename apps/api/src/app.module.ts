import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { PrismaService } from './prisma.service';

@Module({
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
