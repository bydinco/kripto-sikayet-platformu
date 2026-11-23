import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';
import { MulterError } from 'multer';

// FileInterceptor runs multer before the route handler, so a MulterError
// (e.g. LIMIT_FILE_SIZE) never reaches EvidenceFileService — without this
// it would fall through to Nest's generic 500 handler instead of a clear
// 400 the web form can show to the user.
@Catch(MulterError)
export class MulterExceptionFilter extends BaseExceptionFilter implements ExceptionFilter {
  constructor(adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  catch(exception: MulterError, host: ArgumentsHost) {
    const message =
      exception.code === 'LIMIT_FILE_SIZE' ? 'Dosya boyutu 5 MB sınırını aşıyor.' : 'Dosya yüklenemedi.';
    super.catch(new BadRequestException(message), host);
  }
}
