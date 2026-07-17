# YouTube 실업로드 게이트 (`YOUTUBE_UPLOAD_ENABLED`)

> 기본값 **OFF**. 변수가 없거나 값이 이상하면 업로드하지 않는다. 배포해도 업로드는 나가지 않는다.
> 켜고 끄는 건 **env만** — 코드 변경/재빌드 불필요.

## 무엇을 막나

**오직 YouTube로 바이트가 나가는 순간 하나.** 분석·추천·채택·**익스포트 렌더**·YouTube 애널리틱스
수집·Meta/SMR 상태기록 스텁은 전부 평소대로 동작한다. 배포 자체는 되고, 실업로드만 안 된다.

## 켜는 법

값은 `true` `1` `on` `yes` `enabled` 중 하나(대소문자 무관). **그 외 전부 OFF**(오타 → OFF).

### 1) Cloud Run (라우트 게이트)

```bash
# 켜기 — 재배포 없이 env만 갱신 (새 리비전이 뜨고 트래픽이 넘어간다)
gcloud run services update stepd-server --region asia-northeast3 \
  --update-env-vars YOUTUBE_UPLOAD_ENABLED=true

# 끄기 — 변수를 제거하는 쪽이 안전 (false로 두는 것보다 의도가 명확)
gcloud run services update stepd-server --region asia-northeast3 \
  --remove-env-vars YOUTUBE_UPLOAD_ENABLED
```

확인: `curl -s https://<server>/health` → `{"ok":true,...,"youtubeUpload":false}`

### 2) 워커 VM (핸들러 게이트)

워커는 systemd 유닛의 Environment로 받는다. **Cloud Run만 켜면 업로드는 여전히 안 된다** —
실제 업로드는 워커가 한다. 양쪽 다 켜야 나간다(이것도 의도된 이중 안전장치다).

```bash
gcloud compute ssh stepd-worker --zone asia-northeast3-a --command '
  sudo systemctl set-environment YOUTUBE_UPLOAD_ENABLED=true
  sudo mkdir -p /etc/systemd/system/stepd-worker.service.d
  printf "[Service]\nEnvironment=YOUTUBE_UPLOAD_ENABLED=true\n" \
    | sudo tee /etc/systemd/system/stepd-worker.service.d/upload.conf
  sudo systemctl daemon-reload && sudo systemctl restart stepd-worker
  sudo journalctl -u stepd-worker -n 5 --no-pager | grep "실업로드"
'
```

부팅 로그가 상태를 찍는다: `[worker] YouTube 실업로드: ENABLED (실제 업로드됨)` /
`DISABLED (기본값 — YOUTUBE_UPLOAD_ENABLED 미설정)`.

끄려면 `upload.conf`를 지우고 `daemon-reload` + `restart`.

## 어디서 막히나 (3중)

| # | 위치 | 동작 |
|---|------|------|
| 1 | 라우트 `POST /api/distributions/publish` · `/retry` (`index.ts`) | **409 `upload_disabled`**. 큐잉 안 함, distribution 상태 **변경 없음** |
| 2 | 워커 `distribution.publish` (`worker.ts`) | 클립·토큰·파일 읽기 **전에** 중단. 큐에 남아있던 옛 잡도 차단. 사유를 `failed`로 남기고 종료(재시도 루프 방지) |
| 3 | `uploadVideoResumable()` (`youtube.ts`) | 네트워크 호출 **전에** `UploadDisabledError` throw. 실제 바이트 경계 — 미래의 새 호출자도 자동 상속 |

라우트를 우회해도 워커에서, 워커를 우회해도 업로드 함수에서 막힌다.

## 상태 오염 금지

비활성일 때 **`published`/`scheduled`로 바뀌거나 `externalId`/`publishedVideoId`가 쓰이는 경로는 없다.**

- 라우트: 거절 → 상태 변경 자체가 없음 (`pending`으로 남기지도 않는다)
- 워커: `markDistributionFailed`로 사유만 기록 — 이 함수는 `status`/`error`만 쓰고 videoId를 쓸 수 없다.
  `pending`(=업로드 중으로 읽힘)으로 방치하지 않고 사유를 남기는 쪽을 택했다
- 게이트를 켜면 그 `failed` 클립은 배포 보드에서 재시도하면 된다

## 로그

플래그 이름과 ON/OFF만 찍는다. 토큰·시크릿·업로드 URL은 로그에 넣지 않는다.
