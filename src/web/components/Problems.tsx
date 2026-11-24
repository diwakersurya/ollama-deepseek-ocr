import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { copyText } from "../clipboard";
import { useStatus } from "../queries";

/** Says what is wrong with the setup and how to fix it, above everything else. Gone once it is fixed. */
export function Problems() {
  const { data } = useStatus();
  if (!data?.problems.length) return null;
  return (
    <>
      {data.problems.map((p) => (
        <Banner
          key={p.id}
          status={p.level}
          title={p.title}
          description={
            <>
              {p.detail}
              {p.fix && (
                <>
                  {" "}
                  Run: <code style={{ fontFamily: "var(--font-family-code)", fontSize: "inherit" }}>{p.fix}</code>
                </>
              )}
              {data.paused && p.level === "error" && <><br />Files that are waiting are read as soon as this is fixed.</>}
            </>
          }
          endContent={p.fix ? <Button label="Copy command" variant="secondary" size="sm" onClick={() => copyText(p.fix!, "Command copied")} /> : undefined}
        />
      ))}
    </>
  );
}
