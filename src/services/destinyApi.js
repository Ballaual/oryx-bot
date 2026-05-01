const BUNGIE_API_BASE = 'https://www.bungie.net/Platform';

function withTimeout(ms) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);
    return { controller, cancel: () => clearTimeout(t) };
}

async function bungieFetch(path, { method = 'GET', body } = {}) {
    const apiKey = process.env.BUNGIE_API_KEY;
    if (!apiKey) throw new Error('BUNGIE_API_KEY missing');

    const { controller, cancel } = withTimeout(12_000);
    try {
        const res = await fetch(`${BUNGIE_API_BASE}${path}`, {
            method,
            signal: controller.signal,
            headers: {
                'X-API-Key': apiKey,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        const json = await res.json().catch(() => null);
        if (!res.ok) {
            const msg = json?.Message || json?.message || `${res.status} ${res.statusText}`;
            const err = new Error(`Bungie API error: ${msg}`);
            err.status = res.status;
            err.payload = json;
            throw err;
        }
        return json;
    } finally {
        cancel();
    }
}

function parseBungieName(input) {
    const raw = String(input || '').trim();
    const m = raw.match(/^(.+?)#(\d{4})$/);
    if (!m) return null;
    return { displayName: m[1], displayNameCode: Number(m[2]) };
}

function parseGroupIdFromClanUrl(clanUrl) {
    const s = String(clanUrl || '').trim();
    if (!s) return null;
    try {
        const u = new URL(s);
        const q = u.searchParams.get('groupid') || u.searchParams.get('groupId') || u.searchParams.get('groupID');
        if (q && /^\d+$/.test(q)) return q;
        const m = u.pathname.match(/(\d{3,})/g);
        const last = m?.[m.length - 1];
        if (last && /^\d+$/.test(last)) return last;
        return null;
    } catch {
        // Not a URL, maybe just groupId
        if (/^\d+$/.test(s)) return s;
        return null;
    }
}

async function resolveMembershipByBungieName(bungieName) {
    const parsed = parseBungieName(bungieName);
    if (!parsed) return null;

    const body = {
        displayName: parsed.displayName,
        displayNameCode: parsed.displayNameCode,
    };

    const json = await bungieFetch(`/Destiny2/SearchDestinyPlayerByBungieName/-1/`, { method: 'POST', body });
    const results = json?.Response;
    const first = Array.isArray(results) ? results[0] : null;
    if (!first?.membershipId || first?.membershipType == null) return null;

    return {
        membershipId: String(first.membershipId),
        membershipType: Number(first.membershipType),
        displayName: parsed.displayName,
        displayNameCode: parsed.displayNameCode,
    };
}

async function listClanMembers(groupId) {
    const gid = String(groupId);
    let currentPage = 1;
    const out = [];

    while (true) {
        const json = await bungieFetch(`/GroupV2/${gid}/Members/?currentPage=${currentPage}`);
        const resp = json?.Response;
        const results = Array.isArray(resp?.results) ? resp.results : [];

        for (const r of results) {
            const d = r?.destinyUserInfo;
            if (!d?.membershipId || d?.membershipType == null) continue;
            out.push({
                membershipId: String(d.membershipId),
                membershipType: Number(d.membershipType),
                displayName: d.bungieGlobalDisplayName || d.displayName || 'Unknown',
                displayNameCode: d.bungieGlobalDisplayNameCode != null ? Number(d.bungieGlobalDisplayNameCode) : null,
            });
        }

        if (!resp?.hasMore) break;
        currentPage = Number(resp?.nextPage || currentPage + 1);
        if (!Number.isFinite(currentPage) || currentPage <= 0) currentPage += 1;
    }

    return out;
}

async function getCharacterIds(membershipType, membershipId) {
    const json = await bungieFetch(`/Destiny2/${membershipType}/Profile/${membershipId}/?components=100`);
    const chars = json?.Response?.profile?.data?.characterIds;
    return Array.isArray(chars) ? chars : [];
}

async function getRecentActivities(membershipType, membershipId, characterId, mode, count = 5, page = 0) {
    const json = await bungieFetch(
        `/Destiny2/${membershipType}/Account/${membershipId}/Character/${characterId}/Stats/Activities/?mode=${mode}&count=${count}&page=${page}`
    );
    const acts = json?.Response?.activities;
    return Array.isArray(acts) ? acts : [];
}

async function getPgcr(instanceId) {
    const json = await bungieFetch(`/Destiny2/Stats/PostGameCarnageReport/${instanceId}/`);
    return json?.Response || null;
}

function isCompletedFromActivityHistory(a) {
    const completed = a?.values?.completed?.basic?.value;
    const standing = a?.values?.standing?.basic?.value;

    // standing: 0 means Victory, 1 means Defeat.
    // If standing is present (raids/dungeons usually have it), it must be 0.
    if (standing !== undefined && Number(standing) !== 0) return false;

    return Number(completed) === 1;
}

function getActivityInstanceId(a) {
    return a?.activityDetails?.instanceId ? String(a.activityDetails.instanceId) : null;
}

function getActivityPeriodMs(a) {
    const p = a?.period;
    if (!p) return 0;
    const t = Date.parse(p);
    return Number.isFinite(t) ? t : 0;
}

async function findLatestCompletedRaidOrDungeon({ membershipType, membershipId }) {
    const characterIds = await getCharacterIds(membershipType, membershipId);
    const modesToCheck = [4, 82]; // raid, dungeon
    let best = null;

    for (const characterId of characterIds) {
        for (const mode of modesToCheck) {
            const acts = await getRecentActivities(membershipType, membershipId, characterId, mode, 10);
            for (const a of acts) {
                if (!isCompletedFromActivityHistory(a)) continue;
                const instanceId = getActivityInstanceId(a);
                if (!instanceId) continue;
                const periodMs = getActivityPeriodMs(a);
                if (!best || periodMs > best.periodMs) {
                    best = { instanceId, mode, periodMs };
                }
            }
        }
    }

    return best; // {instanceId, mode, periodMs} | null
}

function modeNameToCode(modeName) {
    if (!modeName) return null;
    const m = String(modeName).trim().toLowerCase();
    if (m === 'raid') return 4;
    if (m === 'dungeon') return 82;
    return null;
}

function modesFromFilter(modeFilter) {
    const single = modeNameToCode(modeFilter);
    if (single != null) return [single];
    return [4, 82];
}

async function findLatestCompletedForMembership({ membershipType, membershipId }, modeFilter) {
    const characterIds = await getCharacterIds(membershipType, membershipId);
    const modesToCheck = modesFromFilter(modeFilter);
    const pagesToScan = 5;
    const pageSize = 25;
    let best = null;

    for (const characterId of characterIds) {
        for (const mode of modesToCheck) {
            for (let page = 0; page < pagesToScan; page++) {
                const acts = await getRecentActivities(membershipType, membershipId, characterId, mode, pageSize, page);
                if (!acts.length) break;

                for (const a of acts) {
                    if (!isCompletedFromActivityHistory(a)) continue;
                    const instanceId = getActivityInstanceId(a);
                    if (!instanceId) continue;
                    const periodMs = getActivityPeriodMs(a);
                    if (!best || periodMs > best.periodMs) {
                        best = { instanceId, mode, periodMs };
                    }
                }
            }
        }
    }

    return best; // {instanceId, mode, periodMs} | null
}

async function findLatestCompletedForMembershipWithFilter({ membershipType, membershipId }, modeFilter, filterFn) {
    const characterIds = await getCharacterIds(membershipType, membershipId);
    const modesToCheck = modesFromFilter(modeFilter);
    const pagesToScan = 8;
    const pageSize = 25;
    let best = null;

    for (const characterId of characterIds) {
        for (const mode of modesToCheck) {
            for (let page = 0; page < pagesToScan; page++) {
                const acts = await getRecentActivities(membershipType, membershipId, characterId, mode, pageSize, page);
                if (!acts.length) break;

                for (const a of acts) {
                    if (!isCompletedFromActivityHistory(a)) continue;
                    const instanceId = getActivityInstanceId(a);
                    if (!instanceId) continue;
                    const periodMs = getActivityPeriodMs(a);
                    const candidate = { instanceId, mode, periodMs };

                    if (filterFn) {
                        const accepted = await filterFn(candidate);
                        if (!accepted) continue;
                    }

                    if (!best || periodMs > best.periodMs) {
                        best = candidate;
                    }
                }
            }
        }
    }

    return best; // {instanceId, mode, periodMs} | null
}

async function findLatestCompletedForClan(groupId, modeFilter) {
    const members = await listClanMembers(groupId);
    let best = null;

    for (const member of members) {
        const latestForMember = await findLatestCompletedForMembership(
            { membershipType: member.membershipType, membershipId: member.membershipId },
            modeFilter
        );

        if (latestForMember && (!best || latestForMember.periodMs > best.periodMs)) {
            best = latestForMember;
        }
    }

    return best; // {instanceId, mode, periodMs} | null
}

async function findLatestCompletedForClanWithFilter(groupId, modeFilter, filterFn) {
    const members = await listClanMembers(groupId);
    let best = null;

    for (const member of members) {
        const latestForMember = await findLatestCompletedForMembershipWithFilter(
            { membershipType: member.membershipType, membershipId: member.membershipId },
            modeFilter,
            filterFn
        );

        if (latestForMember && (!best || latestForMember.periodMs > best.periodMs)) {
            best = latestForMember;
        }
    }

    return best; // {instanceId, mode, periodMs} | null
}

module.exports = {
    bungieFetch,
    parseGroupIdFromClanUrl,
    resolveMembershipByBungieName,
    listClanMembers,
    getCharacterIds,
    getRecentActivities,
    getPgcr,
    isCompletedFromActivityHistory,
    getActivityInstanceId,
    getActivityPeriodMs,
    findLatestCompletedRaidOrDungeon,
    findLatestCompletedForMembership,
    findLatestCompletedForClan,
    findLatestCompletedForMembershipWithFilter,
    findLatestCompletedForClanWithFilter,
};

