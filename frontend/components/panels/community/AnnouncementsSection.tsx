import { T } from "@/frontend/lib/ui";
import type { Announcement } from "@/frontend/types";

export default function AnnouncementsSection({
  announcements,
}: {
  announcements: Announcement[];
}) {
  return (
    <div>
      <h2 style={{ margin: "0 0 .5em", fontSize: "1em" }}>ข่าวและประกาศ</h2>
      {announcements.length === 0 && (
        <p style={{ fontSize: ".76em", color: T.subInk }}>ยังไม่มีประกาศ</p>
      )}
      {announcements.slice(0, 4).map((item) => (
        <article
          key={item.id}
          style={{
            border: `1px solid ${T.line}`,
            borderLeft: `4px solid ${item.kind === "alert" ? T.red : T.teal}`,
            borderRadius: "10px",
            padding: ".7em",
            marginBottom: ".5em",
          }}
        >
          {item.image_url && (
            <Image
              unoptimized
              src={item.image_url}
              alt="ภาพประกอบประกาศ"
              width={800}
              height={450}
              style={{
                width: "100%",
                height: "auto",
                maxHeight: "180px",
                objectFit: "cover",
                borderRadius: "8px",
                marginBottom: ".5em",
              }}
            />
          )}
          <b style={{ fontSize: ".82em" }}>{item.title}</b>
          <p
            style={{ margin: ".25em 0 0", fontSize: ".72em", color: T.subInk }}
          >
            {item.body}
          </p>
        </article>
      ))}
    </div>
  );
}
import Image from "next/image";
