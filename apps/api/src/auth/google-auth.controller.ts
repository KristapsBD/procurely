import { Body, Controller, Get, Post, Query, Redirect } from '@nestjs/common';
import { ApiFoundResponse, ApiQuery } from '@nestjs/swagger';
import { GoogleSessionRequest, SessionResponse } from '../contract/api.dto';
import { GoogleSignIn } from './google-sign-in.service';

/** Google sign-in (see GoogleSignIn). These routes exist only when Google is configured. */
@Controller('auth/google')
export class GoogleAuthController {
  constructor(private readonly google: GoogleSignIn) {}

  /** Opened in a browser by the app: redirects to Google's sign-in page. */
  @Get('start')
  @Redirect()
  @ApiFoundResponse({ description: "Redirect to Google's sign-in page." })
  start(
    @Query('return_to') returnTo: string,
    @Query('code_challenge') codeChallenge: string,
  ) {
    return { url: this.google.start(returnTo, codeChallenge) };
  }

  /**
   * Google's redirect URI: redirects back to the app's return address with `?code=` (a
   * handoff code for POST /auth/google/session) or `?error=` (cancelled, rejected, conflict,
   * failed).
   */
  @Get('callback')
  @Redirect()
  @ApiFoundResponse({ description: 'Redirect back to the app.' })
  @ApiQuery({
    name: 'code',
    required: false,
    description: 'Absent when the person cancelled.',
  })
  async callback(@Query('code') code: string, @Query('state') state: string) {
    return { url: await this.google.callback({ code, state }) };
  }

  /** Redeems the handoff code from the callback for a session. */
  @Post('session')
  session(@Body() body: GoogleSessionRequest): Promise<SessionResponse> {
    return this.google.session(body?.code, body?.codeVerifier);
  }
}
