import { T } from "@/frontend/lib/ui";
import type { Activity, UserReputation } from "@/frontend/types";

export default function RewardsSection({
  activities,
  leaders,
}: {
  activities: Activity[];
  leaders: UserReputation[];
}) {
  return (
    <>
      <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: ".9em" }}>
        <h2 style={{ margin: "0 0 .5em", fontSize: ".95em" }}>
          กิจกรรมและรางวัล
        </h2>
        {activities.map((activity) => (
          <div
            key={activity.id}
            style={{
              background: T.chip,
              borderRadius: "10px",
              padding: ".65em",
              marginBottom: ".45em",
            }}
          >
            <b style={{ fontSize: ".8em" }}>{activity.title}</b>
            <div style={{ fontSize: ".7em", color: T.subInk }}>
              {activity.description}
            </div>
            <span
              style={{ fontFamily: T.mono, fontSize: ".7em", color: T.teal }}
            >
              +{activity.reward_points} คะแนน
            </span>
          </div>
        ))}
        {activities.length === 0 && (
          <p style={{ fontSize: ".74em", color: T.subInk }}>ยังไม่มีกิจกรรม</p>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: ".9em" }}>
        <h2 style={{ margin: "0 0 .5em", fontSize: ".95em" }}>
          Top Contributor · 7 วันล่าสุด
        </h2>
        {leaders.slice(0, 5).map((user, index) => (
          <div
            key={user.user_id}
            style={{
              padding: ".45em 0",
              borderBottom: `1px solid ${T.line}`,
              fontSize: ".76em",
            }}
          >
            <div style={{ display: "flex", gap: ".5em", alignItems: "center" }}>
              <b style={{ fontFamily: T.mono, color: T.teal }}>#{index + 1}</b>
              <span style={{ flex: 1 }}>{user.display_name ?? "สมาชิก"}</span>
              <b style={{ fontFamily: T.mono }}>+{user.weekly_points}</b>
            </div>
            {user.badges.length > 0 && (
              <div
                style={{
                  margin: ".3em 0 0 1.9em",
                  color: T.subInk,
                  fontSize: ".88em",
                }}
              >
                {user.badges.join(" · ")}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
