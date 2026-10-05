#!/usr/bin/env node
"use strict";

const { runCheckin, readCookieSecret, defaultLogger } = require("./checkin");
const { parseAccounts, redactSecrets } = require("../lib/glados-core");

const MAX_ATTEMPTS = 3;
const RETRY_INTERVAL_MS = 15 * 60 * 1000;

// One workflow run means one GitHub completion notification. Retry only failed
// accounts in memory; cookies and success state are never persisted to disk.
async function runDailyCheckin(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || defaultLogger();
  const wait = options.wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const rawSecret = readCookieSecret(env);
  let accounts;
  try {
    accounts = parseAccounts(rawSecret);
  } catch (error) {
    logger.error(redactSecrets(error.message || String(error), [String(rawSecret || "")]));
    return { ok: false, exitCode: 1, results: [] };
  }

  let outcome;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    logger.info(`每日签到尝试 ${attempt}/${MAX_ATTEMPTS}`);
    outcome = await runCheckin({ ...options, env, logger, accounts });
    if (outcome.ok || outcome.error) return outcome;
    if (attempt < MAX_ATTEMPTS) {
      logger.info("还有账号未签到成功，15 分钟后重试；已成功的账号自动跳过");
      await wait(RETRY_INTERVAL_MS);
    }
  }
  return outcome;
}

if (require.main === module) {
  runDailyCheckin()
    .then((outcome) => { process.exitCode = outcome.exitCode; })
    .catch((error) => {
      console.error(redactSecrets(error.message || String(error)));
      process.exitCode = 1;
    });
}

module.exports = { runDailyCheckin, MAX_ATTEMPTS, RETRY_INTERVAL_MS };
