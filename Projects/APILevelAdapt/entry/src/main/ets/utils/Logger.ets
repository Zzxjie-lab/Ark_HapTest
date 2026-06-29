/*
 * Copyright (c) 2025 Huawei Device Co., Ltd.
 * Licensed under the Apache License,Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { hilog } from '@kit.PerformanceAnalysisKit';

/**
 * Logger utility to centralize log formatting and output.
 */
export class Logger {
  // Log domain to distinguish module source.
  private static readonly domain: number = 0xFF00;
  // Log prefix for quick issue localization.
  private static readonly prefix: string = 'APILevelAdapt';
  // Log format template.
  private static format: string = '%{public}s';

  /**
   * Print a debug level log.
   * @param args Debug message content.
   */
  static debug(...args: string[]): void {
    hilog.debug(Logger.domain, Logger.prefix, Logger.format, ...args);
  }

  /**
   * Print an info level log.
   * @param args Information content.
   */
  static info(...args: string[]): void {
    hilog.info(Logger.domain, Logger.prefix, Logger.format, ...args);
  }

  /**
   * Print a warning level log.
   * @param args Warning content.
   */
  static warn(...args: string[]): void {
    hilog.warn(Logger.domain, Logger.prefix, Logger.format, ...args);
  }

  /**
   * Print an error level log.
   * @param args Error content.
   */
  static error(...args: string[]): void {
    hilog.error(Logger.domain, Logger.prefix, Logger.format, ...args);
  }
}