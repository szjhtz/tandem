import { useEffect, useRef } from "react";
import { subscribeSse } from "../../services/sse.js";

export function useEngineStream(
  url: string,
  onMessage: (event: MessageEvent<string>) => void,
  options: { enabled?: boolean; withCredentials?: boolean } = {}
) {
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!options.enabled || !url) return;
    return subscribeSse(url, (event) => onMessageRef.current(event), {
      withCredentials: options.withCredentials,
    });
  }, [options.enabled, options.withCredentials, url]);
}
