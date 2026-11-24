// Copyright 2020-     Robot Framework Foundation
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Runs the recorder hooks a JS extension can export; see the `Record Keyword`
// documentation and Browser/recorder/README.md. Exports starting with `__` are
// never keywords (`initializeExtension`).
//
// The hooks work on data: an Action is a plain object, a hook gets a copy and
// returns the Action to record. Browser checks only the keys it reads.

import { BrowserContext, Page } from 'playwright';

import { logger } from './browser_logger';
import type { Action } from './recorder';

// A module loaded with the `jsextension` import argument.
export type JsExtension = Record<string, unknown>;

export const RECORDING_STARTED_HOOK = '__recordingStarted';
export const RECORDED_ACTION_HOOK = '__recordedAction';

// The name of the Action a pick of `Record Selector` or of the toolbar's Pick
// reaches the hooks as.
export const PICK_ACTION_NAME = 'pick';

// How long the hooks may take for one Action; when they take longer, the
// Action is recorded as Playwright reported it.
export const HOOKS_TIMEOUT_MS = 2000;

// --------------------------------------------------------- __recordingStarted

// The extensions whose `__recordingStarted` hook already ran, by context.
const startedByContext = new WeakMap<BrowserContext, WeakSet<JsExtension>>();

// Runs each extension's `__recordingStarted({ context })` once per context,
// before its first recording session, in load order. A hook that fails fails
// the session, and runs again next time.
export async function runRecordingStartedHooks(context: BrowserContext, extensions: JsExtension[] = []): Promise<void> {
    const started = startedByContext.get(context) ?? new WeakSet<JsExtension>();
    startedByContext.set(context, started);
    for (const extension of extensions) {
        const hook = extension[RECORDING_STARTED_HOOK];
        if (typeof hook !== 'function') continue;
        if (started.has(extension)) continue;
        started.add(extension);
        try {
            await hook({ context });
        } catch (error) {
            started.delete(extension);
            throw new Error(`The ${RECORDING_STARTED_HOOK} hook of a JS extension failed: ${String(error)}`, {
                cause: error,
            });
        }
    }
}

// ----------------------------------------------------------- __recordedAction

export function hasRecordedActionHook(extensions: JsExtension[]): boolean {
    return extensions.some((extension) => typeof extension[RECORDED_ACTION_HOOK] === 'function');
}

// The selector to show for a pick: the one the extensions' hooks give for
// `{ name: 'pick', selector }`.
export async function runPickHooks(selector: string, page: Page, extensions: JsExtension[] = []): Promise<string> {
    if (!hasRecordedActionHook(extensions)) return selector;
    const picked = await runRecordedActionHooks({ name: PICK_ACTION_NAME, selector }, page, page.context(), extensions);
    return picked.selector as string;
}

// The Action to record for the `reported` one, which is the Action Playwright
// reported, or `{ name: 'pick', selector }` for a pick: the Action the
// extensions' `__recordedAction` hooks give, or `reported` when there are none,
// when they keep it, or when they take longer than `timeoutMs`.
export async function runRecordedActionHooks(
    reported: Action,
    page: Page | undefined,
    context: BrowserContext | undefined,
    extensions: JsExtension[],
    timeoutMs = HOOKS_TIMEOUT_MS,
): Promise<Action> {
    if (!hasRecordedActionHook(extensions)) return reported;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<Action>((resolve) => {
        timer = setTimeout(() => {
            logger.info(
                `recorder: ${RECORDED_ACTION_HOOK} took longer than ${timeoutMs} ms, the '${reported.name}' Action is kept`,
            );
            resolve(reported);
        }, timeoutMs);
    });
    try {
        return await Promise.race([chainHooks(reported, page, context, extensions), timeout]);
    } finally {
        clearTimeout(timer);
    }
}

// Each extension's `__recordedAction({ action, page, context })`, in load
// order, each on a copy of the Action the one before gave. A hook may return a
// promise. An Action replaces the one given; `undefined` or `null` keeps it;
// anything else, or a failure, is logged and ignored, so a broken extension
// never loses an Action or a pick.
async function chainHooks(
    reported: Action,
    page: Page | undefined,
    context: BrowserContext | undefined,
    extensions: JsExtension[],
): Promise<Action> {
    const isPick = reported.name === PICK_ACTION_NAME;
    let recorded = reported;
    for (const extension of extensions) {
        const hook = extension[RECORDED_ACTION_HOOK];
        if (typeof hook !== 'function') continue;
        let returned: unknown;
        try {
            returned = await hook({ action: structuredClone(recorded), page, context });
        } catch (error) {
            logger.info(
                `recorder: ${RECORDED_ACTION_HOOK} failed, the '${recorded.name}' Action is kept: ${String(error)}`,
            );
            continue;
        }
        if (returned === undefined || returned === null) continue;
        const reason = whyNotRecordable(returned, isPick);
        if (reason) {
            logger.info(`recorder: ${RECORDED_ACTION_HOOK} ${reason}, the '${recorded.name}' Action is kept`);
            continue;
        }
        recorded = returned as Action;
    }
    return recorded;
}

// Why Browser cannot record what a hook `returned`, or undefined when it can.
// Only the keys Browser reads are checked; any other key is the extension's own.
export function whyNotRecordable(returned: unknown, isPick: boolean): string | undefined {
    if (!isPlainObject(returned)) {
        const what = returned === null ? 'null' : typeof returned;
        return `returned ${what}, not an Action`;
    }
    if (!isNonEmptyString(returned.name)) return 'returned an Action without a name';
    if ('selector' in returned && !isNonEmptyString(returned.selector)) {
        return 'returned an empty or non-string selector';
    }
    if (isPick && !isNonEmptyString(returned.selector)) return 'returned a pick without a selector';
    if ('options' in returned && !areOptions(returned.options)) {
        return 'returned options that are neither all values nor all { label } descriptors';
    }
    return undefined;
}

// ------------------------------------------------------------------ helpers

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null) return false;
    return Object.getPrototypeOf(value) === Object.prototype;
}

function isNonEmptyString(value: unknown): boolean {
    return typeof value === 'string' && value.trim() !== '';
}

// The options of a `select` Action: the values Playwright records, or the
// labels as Playwright's option descriptors, `{ label: 'AMELUNG' }`.
function areOptions(value: unknown): boolean {
    if (!Array.isArray(value)) return false;
    if (value.every((option) => typeof option === 'string')) return true;
    return value.length > 0 && value.every(isLabelDescriptor);
}

function isLabelDescriptor(option: unknown): boolean {
    if (!isPlainObject(option)) return false;
    const keys = Object.keys(option);
    return keys.length === 1 && keys[0] === 'label' && typeof option.label === 'string';
}
