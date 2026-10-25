// GitHub profile fetcher.
// - With a token: GraphQL (pinned repos, language bytes, last-year contribution stats).
// - Without a token: public REST API (60 requests/hour, public data only).
// Both paths add open-source contributions = merged PRs to repositories the user doesn't own.

const API = "https://api.github.com";
const TIMEOUT_MS = 20_000;

function headers(token) {
  const h = {
    Accept: "application/vnd.github+json",
    "User-Agent": "resume-builder-mcpb",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function explain(res) {
  let body = "";
  try {
    body = (await res.json())?.message || "";
  } catch {}
  if (res.status === 401) return "GitHub rejected the token (401). Check the token in the extension settings, or remove it to use public data only.";
  if (res.status === 404) return "GitHub user not found (404).";
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get("x-ratelimit-reset");
    const when = reset ? ` Resets at ${new Date(Number(reset) * 1000).toLocaleTimeString()}.` : "";
    return `GitHub rate limit reached.${when} Adding a GitHub token in the extension settings raises the limit. ${body}`.trim();
  }
  return `GitHub API error ${res.status}: ${body}`;
}

async function rest(pathname, token) {
  const res = await fetch(API + pathname, { headers: headers(token), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(await explain(res));
  return res.json();
}

async function graphql(query, variables, token) {
  const res = await fetch(API + "/graphql", {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(await explain(res));
  const json = await res.json();
  if (json.errors?.length) throw new Error("GitHub GraphQL error: " + json.errors.map((e) => e.message).join("; "));
  return json.data;
}

const REPO_FIELDS = `
  name nameWithOwner description url homepageUrl stargazerCount forkCount
  isPrivate isArchived createdAt pushedAt
  primaryLanguage { name }
  languages(first: 6, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name } } }
  repositoryTopics(first: 8) { nodes { topic { name } } }
`;

function userQuery(byLogin, includePrivate) {
  const privacy = includePrivate ? "" : ", privacy: PUBLIC";
  return `
  query${byLogin ? "($login: String!)" : ""} {
    user: ${byLogin ? "user(login: $login)" : "viewer"} {
      login name bio company location websiteUrl url createdAt
      followers { totalCount }
      pinnedItems(first: 6, types: REPOSITORY) { nodes { ... on Repository { ${REPO_FIELDS} } } }
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false${privacy},
                   orderBy: { field: STARGAZERS, direction: DESC }) {
        totalCount
        nodes { ${REPO_FIELDS} }
      }
      contributionsCollection {
        totalCommitContributions totalPullRequestContributions
        totalPullRequestReviewContributions totalIssueContributions
        restrictedContributionsCount
        contributionCalendar { totalContributions }
      }
    }
  }`;
}

function normalizeGqlRepo(r) {
  return {
    name: r.name,
    fullName: r.nameWithOwner,
    description: r.description || undefined,
    url: r.url,
    homepage: r.homepageUrl || undefined,
    stars: r.stargazerCount,
    forks: r.forkCount,
    language: r.primaryLanguage?.name,
    languages: r.languages?.edges?.map((e) => e.node.name) ?? [],
    topics: r.repositoryTopics?.nodes?.map((n) => n.topic.name) ?? [],
    private: r.isPrivate || undefined,
    archived: r.isArchived || undefined,
    createdAt: r.createdAt?.slice(0, 10),
    lastPushed: r.pushedAt?.slice(0, 10),
  };
}

function normalizeRestRepo(r) {
  return {
    name: r.name,
    fullName: r.full_name,
    description: r.description || undefined,
    url: r.html_url,
    homepage: r.homepage || undefined,
    stars: r.stargazers_count,
    forks: r.forks_count,
    language: r.language || undefined,
    languages: r.language ? [r.language] : [],
    topics: r.topics ?? [],
    archived: r.archived || undefined,
    createdAt: r.created_at?.slice(0, 10),
    lastPushed: r.pushed_at?.slice(0, 10),
  };
}

function shares(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (!total) return [];
  return Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, w]) => ({ name, share: `${Math.round((w / total) * 1000) / 10}%` }));
}

/** Merged PRs to repositories the user doesn't own, grouped by repository. */
async function openSourceContributions(login, token, limit) {
  const q = encodeURIComponent(`author:${login} type:pr is:merged -user:${login}`);
  const data = await rest(`/search/issues?q=${q}&per_page=100&sort=updated`, token);
  const byRepo = new Map();
  for (const pr of data.items ?? []) {
    const fullName = pr.repository_url.replace(`${API}/repos/`, "");
    const entry = byRepo.get(fullName) ?? { repo: fullName, url: `https://github.com/${fullName}`, mergedPRs: 0, examples: [] };
    entry.mergedPRs++;
    if (entry.examples.length < 3) {
      entry.examples.push({ title: pr.title, url: pr.html_url, mergedAt: pr.pull_request?.merged_at?.slice(0, 10) });
    }
    byRepo.set(fullName, entry);
  }
  const groups = [...byRepo.values()].sort((a, b) => b.mergedPRs - a.mergedPRs).slice(0, limit);

  // Star counts make well-known projects stand out (e.g. a merged PR to Babel).
  await Promise.all(
    groups.map(async (g) => {
      try {
        const r = await rest(`/repos/${g.repo}`, token);
        g.stars = r.stargazers_count;
        g.description = r.description || undefined;
      } catch {}
    })
  );
  groups.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || b.mergedPRs - a.mergedPRs);
  return { totalMergedExternalPRs: data.total_count ?? 0, repositories: groups };
}

export async function fetchGithubProfile({ username, token, includePrivate = false, maxRepos = 10 }) {
  const notes = [];
  let result;

  if (token) {
    const data = await graphql(userQuery(Boolean(username), includePrivate), username ? { login: username } : {}, token);
    const u = data.user;
    if (!u) throw new Error("GitHub user not found.");
    const repos = u.repositories.nodes.filter((r) => includePrivate || !r.isPrivate);

    const langBytes = {};
    for (const r of repos) for (const e of r.languages.edges) langBytes[e.node.name] = (langBytes[e.node.name] ?? 0) + e.size;

    const cc = u.contributionsCollection;
    result = {
      source: "graphql (authenticated)",
      user: {
        login: u.login, name: u.name || undefined, bio: u.bio || undefined, company: u.company || undefined,
        location: u.location || undefined, website: u.websiteUrl || undefined, url: u.url,
        followers: u.followers.totalCount, memberSince: u.createdAt.slice(0, 4),
      },
      stats: {
        ownRepos: u.repositories.totalCount,
        totalStars: repos.reduce((a, r) => a + r.stargazerCount, 0),
        contributionsLastYear: cc.contributionCalendar.totalContributions,
        commitsLastYear: cc.totalCommitContributions,
        pullRequestsLastYear: cc.totalPullRequestContributions,
        reviewsLastYear: cc.totalPullRequestReviewContributions,
        privateContributionsLastYear: cc.restrictedContributionsCount || undefined,
      },
      languages: shares(langBytes),
      pinned: u.pinnedItems.nodes.filter((r) => r && (includePrivate || !r.isPrivate)).map(normalizeGqlRepo),
      topRepos: repos.slice(0, maxRepos).map(normalizeGqlRepo),
    };
    notes.push("Language shares are by code size across the user's own non-fork repositories.");
  } else {
    if (!username) {
      throw new Error("No GitHub username given. Pass `username`, or set a username or token in the extension settings.");
    }
    const [u, repoList] = await Promise.all([
      rest(`/users/${encodeURIComponent(username)}`),
      rest(`/users/${encodeURIComponent(username)}/repos?per_page=100&type=owner&sort=pushed`),
    ]);
    const repos = repoList.filter((r) => !r.fork).sort((a, b) => b.stargazers_count - a.stargazers_count);
    const langCount = {};
    for (const r of repos) if (r.language) langCount[r.language] = (langCount[r.language] ?? 0) + 1;

    result = {
      source: "rest (public, unauthenticated)",
      user: {
        login: u.login, name: u.name || undefined, bio: u.bio || undefined, company: u.company || undefined,
        location: u.location || undefined, website: u.blog || undefined, url: u.html_url,
        followers: u.followers, memberSince: u.created_at?.slice(0, 4),
      },
      stats: { ownRepos: u.public_repos, totalStars: repos.reduce((a, r) => a + r.stargazers_count, 0) },
      languages: shares(langCount),
      topRepos: repos.slice(0, maxRepos).map(normalizeRestRepo),
    };
    notes.push(
      "No GitHub token: public data only. Pinned repos and contribution counts need a token (set one in the extension settings).",
      "Language shares are by number of repositories."
    );
  }

  try {
    result.openSourceContributions = await openSourceContributions(result.user.login, token, 8);
  } catch (e) {
    notes.push(`Could not load open-source contributions: ${e.message}`);
  }

  result.notes = notes;
  return result;
}
