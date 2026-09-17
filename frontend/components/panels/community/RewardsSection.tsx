import AppIcon from "@/frontend/components/ui/AppIcon";
import type { Activity, LeaderboardEntry } from "@/frontend/types";

export default function RewardsSection({
  activities,
  leaders,
}: {
  activities: Activity[];
  leaders: LeaderboardEntry[];
}) {
  return (
    <div className="cp-rewards">
      <section className="cp-rewards__section" aria-labelledby="weekly-ranking">
        <header className="cp-rewards__heading">
          <span className="cp-rewards__heading-icon" aria-hidden="true">
            <AppIcon name="activity" size={19} />
          </span>
          <span>
            <h2 id="weekly-ranking">ผู้ช่วยชุมชนประจำสัปดาห์</h2>
            <p>นับคะแนนกิจกรรมในช่วง 7 วันล่าสุด</p>
          </span>
        </header>

        {leaders.length > 0 ? (
          <ol className="cp-leaderboard" aria-label="อันดับผู้ช่วยชุมชน 7 วัน">
            {leaders.slice(0, 10).map((user) => (
              <li
                className={`cp-leaderboard__item cp-leaderboard__item--rank-${Math.min(user.rank, 4)}`}
                key={user.user_id}
              >
                <span
                  className="cp-leaderboard__rank"
                  aria-label={`อันดับ ${user.rank}`}
                >
                  {user.rank}
                </span>
                <span className="cp-leaderboard__person">
                  <strong>{user.display_name ?? "สมาชิก ClearPath"}</strong>
                  <small>
                    {user.badges[0] ?? "ช่วยแบ่งปันข้อมูลอากาศให้ชุมชน"}
                  </small>
                </span>
                <span className="cp-leaderboard__points">
                  <strong>{user.weekly_points}</strong>
                  <small>คะแนน</small>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="cp-leaderboard__empty">
            <AppIcon name="community" size={24} />
            <strong>ยังไม่มีอันดับในสัปดาห์นี้</strong>
            <span>ส่งข้อมูลหรือช่วยขอบคุณรายงานใกล้คุณเพื่อเริ่มอันดับ</span>
          </div>
        )}
      </section>

      <section
        className="cp-rewards__section"
        aria-labelledby="community-activities"
      >
        <h2 id="community-activities" className="cp-rewards__title">
          กิจกรรมและรางวัล
        </h2>
        {activities.map((activity) => (
          <article className="cp-reward-card" key={activity.id}>
            <span>
              <strong>{activity.title}</strong>
              <small>{activity.description}</small>
            </span>
            <b>+{activity.reward_points} คะแนน</b>
          </article>
        ))}
        {activities.length === 0 && (
          <p className="cp-muted-status">ยังไม่มีกิจกรรมในขณะนี้</p>
        )}
      </section>
    </div>
  );
}
