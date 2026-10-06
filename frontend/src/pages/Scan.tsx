import Appraise from "@/pages/Appraise";

// The Scan route is the capture + appraise flow. Keeps the existing Appraise
// implementation intact (camera, condition, save-to-inventory) and only presents
// it under the new /scan URL as part of the Forest Thrift Vision shell.
export default function Scan() {
  return <Appraise />;
}
