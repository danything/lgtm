import { accountExists, findAccount } from "./account";
import db from "./db";
import { deleteAllFolders } from "./folders";
import { deleteAllImages } from "./lgtm";

/** Days in the daily table. */
const DAYS = 30;

const one = <T>(sql: string) => db().query<T, []>(sql).get() as T;

const names = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");

/**
 * Admins named in ADMIN_GH_LOGINS. The app cannot revoke them, so they are the
 * way back in when a granted admin was a mistake.
 */
export function isEnvAdmin(key: string | undefined): boolean {
  const login = findAccount(key)?.login;
  return (
    login !== undefined && names(process.env.ADMIN_GH_LOGINS).includes(login)
  );
}

/** Named in the environment, or granted from the admin page. */
export function isAdmin(key: string | undefined): boolean {
  if (key === undefined) return false;
  if (isEnvAdmin(key)) return true;
  return (
    db()
      .query<{ userKey: string }, [string]>(
        "SELECT userKey FROM admin WHERE userKey = ?",
      )
      .get(key) !== null
  );
}

export type AdminUser = {
  userKey: string;
  login: string | null;
  images: number;
  admin: boolean;
  /** From the environment; the page must not offer to revoke it. */
  fixed: boolean;
};

/** Signed-in accounts and image owners; owners from before GitHub have no login. */
export function adminUsers(): AdminUser[] {
  return db()
    .query<
      {
        userKey: string;
        login: string | null;
        images: number;
        granted: number;
      },
      []
    >(
      `
			SELECT k.key AS userKey,
			       ghUser.login AS login,
			       (SELECT COUNT(*) FROM lImage WHERE lImage.userKey = k.key) AS images,
			       (SELECT COUNT(*) FROM admin WHERE admin.userKey = k.key) AS granted
			FROM (SELECT key FROM ghUser UNION SELECT userKey AS key FROM lImage) k
			LEFT JOIN ghUser ON ghUser.key = k.key
			ORDER BY images DESC, k.key
			LIMIT 200
		`,
    )
    .all()
    .map((row) => {
      const fixed = isEnvAdmin(row.userKey);
      return {
        userKey: row.userKey,
        login: row.login,
        images: row.images,
        admin: fixed || row.granted > 0,
        fixed,
      };
    });
}

/** The reason it could not be done, or undefined if it was. */
export function setAdmin(
  userKey: string,
  admin: boolean,
  by: string,
): string | undefined {
  if (!accountExists(userKey)) return "そのユーザーは存在しません";
  // Would lock you out of the page needed to put it back.
  if (!admin && userKey === by) return "自分の権限は解除できません";
  if (!admin && isEnvAdmin(userKey)) return "環境変数で指定された管理者です";

  if (admin) {
    db().run(
      "INSERT OR IGNORE INTO admin (userKey, grantedAt, grantedBy) VALUES (?, ?, ?)",
      [userKey, Date.now(), by],
    );
  } else {
    db().run("DELETE FROM admin WHERE userKey = ?", [userKey]);
  }
  return undefined;
}

/**
 * Removes an account with its admin grant and its images. The images go too,
 * or the account would live on as their owner.
 */
export function deleteUser(
  userKey: string,
  by: string,
): { error: string } | { images: number } {
  const owner =
    accountExists(userKey) ||
    db()
      .query<{ userKey: string }, [string]>(
        "SELECT userKey FROM lImage WHERE userKey = ? LIMIT 1",
      )
      .get(userKey) !== null;
  if (!owner) return { error: "そのユーザーは存在しません" };
  if (userKey === by) return { error: "自分自身は削除できません" };
  if (isEnvAdmin(userKey)) return { error: "環境変数で指定された管理者です" };

  const images = deleteAllImages(userKey);
  db().transaction(() => {
    db().run("DELETE FROM admin WHERE userKey = ?", [userKey]);
    db().run("DELETE FROM ghUser WHERE key = ?", [userKey]);
    deleteAllFolders(userKey);
  })();
  return { images };
}

export type LgtmAdmin = {
  images: number;
  owners: number;
  githubUsers: number;
  uploaders: {
    userKey: string;
    login: string | null;
    images: number;
    latest: number;
  }[];
  days: { date: string; images: number }[];
};

export function lgtmAdmin(): LgtmAdmin {
  const { images } = one<{ images: number }>(
    "SELECT COUNT(*) AS images FROM lImage",
  );
  const { owners } = one<{ owners: number }>(
    "SELECT COUNT(DISTINCT userKey) AS owners FROM lImage",
  );
  const { githubUsers } = one<{ githubUsers: number }>(
    "SELECT COUNT(*) AS githubUsers FROM ghUser",
  );

  // The key is a session credential, so only its start is shown.
  const uploaders = db()
    .query<
      {
        userKey: string;
        login: string | null;
        images: number;
        latest: number;
      },
      []
    >(
      `
			SELECT lImage.userKey AS userKey,
			       ghUser.login AS login,
			       COUNT(*) AS images,
			       MAX(lImage.createdAt) AS latest
			FROM lImage
			LEFT JOIN ghUser ON ghUser.key = lImage.userKey
			GROUP BY lImage.userKey
			ORDER BY images DESC
			LIMIT 50
		`,
    )
    .all()
    .map((row) => ({ ...row, userKey: row.userKey.slice(0, 8) }));

  const days = db()
    .query<{ date: string; images: number }, []>(
      `
			SELECT date(createdAt / 1000, 'unixepoch', '+9 hours') AS date,
			       COUNT(*) AS images
			FROM lImage GROUP BY date ORDER BY date DESC LIMIT ${DAYS}
		`,
    )
    .all();

  return { images, owners, githubUsers, uploaders, days };
}
