import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GroupMemberGuard } from '../../common/guards/group-member.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ImportService } from './import.service';
import { ApproveRowDto, RejectRowDto } from './dto/import.dto';

@UseGuards(JwtAuthGuard, GroupMemberGuard)
@Controller('groups/:groupId/import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  // List previous import jobs
  @Get()
  async getImportJobs(@Param('groupId') groupId: string) {
    return this.importService.getImportJobs(groupId);
  }

  // Upload a CSV file
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadCsv(
    @Param('groupId') groupId: string,
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }
    return this.importService.uploadCsv(groupId, user.id, file);
  }

  // Get job details + summary statistics
  @Get(':jobId')
  async getImportJob(
    @Param('groupId') groupId: string,
    @Param('jobId') jobId: string,
  ) {
    return this.importService.getImportJob(groupId, jobId);
  }

  // Approve all clean/warning rows and bulk import them
  @Post(':jobId/approve-all')
  async approveAll(
    @Param('groupId') groupId: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
  ) {
    const importedCount = await this.importService.approveAll(groupId, jobId, user.id);
    return { importedCount };
  }

  // Bulk-import clean and already approved rows
  @Post(':jobId/import-clean')
  async importClean(
    @Param('groupId') groupId: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
  ) {
    const importedCount = await this.importService.importReadyRows(groupId, jobId, user.id);
    return { importedCount };
  }

  // Reject all rows containing errors
  @Post(':jobId/reject-errors')
  async rejectErrors(
    @Param('groupId') groupId: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
  ) {
    const rejectedCount = await this.importService.rejectAllErrors(groupId, jobId, user.id);
    return { rejectedCount };
  }

  // Approve a single row with resolutions
  @Post(':jobId/rows/:rowId/approve')
  async approveRow(
    @Param('groupId') groupId: string,
    @Param('jobId') jobId: string,
    @Param('rowId') rowId: string,
    @CurrentUser() user: any,
    @Body() dto: ApproveRowDto,
  ) {
    return this.importService.approveRow(groupId, jobId, rowId, user.id, dto);
  }

  // Reject a single row
  @Post(':jobId/rows/:rowId/reject')
  async rejectRow(
    @Param('groupId') groupId: string,
    @Param('jobId') jobId: string,
    @Param('rowId') rowId: string,
    @CurrentUser() user: any,
    @Body() dto: RejectRowDto,
  ) {
    return this.importService.rejectRow(groupId, jobId, rowId, user.id, dto.reason);
  }
}
