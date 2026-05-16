// "마리오네트주름" 입력 시 "마리오네트라인" 으로 정규화되도록 normalization 추가
import fs from "node:fs";

const JSON_PATH = new URL(
  "../src/data/procedure-mappings/procedure-mappings.json",
  import.meta.url,
);
const json = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));

if (!json.normalizations["마리오네트주름"]) {
  json.normalizations["마리오네트주름"] = ["마리오네트라인"];
  console.log("normalization 추가: 마리오네트주름 → [마리오네트라인]");
} else {
  console.log("이미 존재");
}

fs.writeFileSync(JSON_PATH, JSON.stringify(json, null, 2) + "\n");
console.log("저장 완료");
