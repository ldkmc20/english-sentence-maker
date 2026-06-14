# 영어 문장 만들기 앱 제작 절차

이 문서는 갤럭시 S25 플러스에서 사용할 수 있는 한국어 음성 인식 기반 영어 문장 정리 앱을 만든 전체 절차를 설명한다. 목적은 완성된 앱을 단순히 사용하는 것이 아니라, 어떤 원리로 구성했고 어떤 순서로 만들었는지 이해하는 것이다.

## 1. 요구 사항 정리

처음 요청은 다음과 같았다.

- 하루 동안 한국어로 한 말을 음성 인식한다.
- 그중 자주 사용하는 대표 문장을 추린다.
- 대표 문장을 영어로 영작해서 정리한다.
- 삼성 갤럭시 S25 플러스에서 사용할 수 있어야 한다.

여기서 가장 먼저 확인한 것은 가능 여부다. 기술적으로는 가능하지만, Android와 브라우저 보안 정책 때문에 "하루 종일 백그라운드에서 조용히 계속 듣는 앱"은 현실적으로 안정적이지 않고 개인정보 측면에서도 권장하기 어렵다. 그래서 첫 버전은 사용자가 직접 `녹음 시작`을 눌러 켜 둔 학습 세션 동안 음성을 인식하는 방식으로 설계했다.

## 2. 구현 방식 선택

처음부터 네이티브 Android 앱으로 만들 수도 있지만, 첫 버전은 PWA 방식으로 만들었다.

PWA는 Progressive Web App의 약자로, 웹사이트처럼 만들지만 휴대폰 홈 화면에 앱처럼 추가할 수 있는 형태다. 이 프로젝트에서는 다음 이유로 PWA를 선택했다.

- 갤럭시 Chrome 또는 Samsung Internet에서 바로 실행할 수 있다.
- 별도의 Android Studio 프로젝트 없이 빠르게 만들 수 있다.
- HTTPS로 배포하면 브라우저 음성 인식 API를 사용할 수 있다.
- 파일 구조가 단순해서 학습하기 좋다.

단점도 있다.

- 화면이 꺼지거나 브라우저가 백그라운드로 가면 음성 인식이 멈출 수 있다.
- 브라우저의 Web Speech API 지원 여부에 영향을 받는다.
- 진짜 장시간 백그라운드 녹음은 네이티브 Android 앱이 더 적합하다.

## 3. 프로젝트 파일 구조

최종적으로 만든 파일은 다음과 같다.

```text
.
├── .gitignore
├── .nojekyll
├── README.md
├── app.js
├── icon.svg
├── index.html
├── maker.md
├── manifest.webmanifest
├── package.json
├── server.js
├── styles.css
└── sw.js
```

각 파일의 역할은 다음과 같다.

- `index.html`: 화면의 뼈대다. 제목, 녹음 버튼, 문장 목록, 영어 정리 영역을 정의한다.
- `styles.css`: 화면 디자인을 담당한다. 모바일에서도 보기 좋게 반응형 레이아웃을 만든다.
- `app.js`: 앱의 핵심 동작을 담당한다. 음성 인식, 문장 저장, 빈도 분석, OpenAI API 호출, 내보내기 기능이 들어 있다.
- `manifest.webmanifest`: 휴대폰에서 홈 화면에 추가할 때 앱 이름, 아이콘, 실행 방식을 알려준다.
- `sw.js`: 서비스 워커다. 앱 파일을 캐시해서 PWA처럼 동작하도록 돕는다.
- `icon.svg`: 앱 아이콘이다.
- `server.js`: PC에서 로컬 테스트를 할 때 사용하는 간단한 웹 서버다.
- `package.json`: `npm start` 명령으로 로컬 서버를 실행할 수 있게 한다.
- `.nojekyll`: GitHub Pages가 Jekyll 처리를 하지 않고 정적 파일을 그대로 배포하도록 한다.
- `.gitignore`: Git에 올리지 않을 파일을 지정한다.
- `README.md`: 사용법과 배포 주소를 적은 설명 파일이다.
- `maker.md`: 지금 읽고 있는 제작 절차 문서다.

## 4. 화면 구성

화면은 크게 네 영역으로 나눴다.

1. 앱 상태 영역
   - 앱 이름과 음성 인식 지원 여부를 보여준다.

2. 음성 인식 제어 영역
   - `녹음 시작`, `정지`, `오늘 기록 삭제` 버튼이 있다.
   - 현재 듣는 중인지, 시간이 얼마나 지났는지 표시한다.

3. 한국어 문장 및 빈도 분석 영역
   - 인식된 한국어 문장 목록을 보여준다.
   - 같은 문장이 몇 번 나왔는지 계산해서 많이 쓴 문장을 보여준다.

4. 영어 문장 정리 영역
   - 자주 나온 문장을 영어로 정리한다.
   - OpenAI API 키가 있으면 앱 안에서 바로 요청한다.
   - API 키가 없으면 프롬프트를 복사해서 다른 AI 도구에 붙여 넣을 수 있다.

## 5. 음성 인식 원리

브라우저에서 음성 인식을 하기 위해 `SpeechRecognition` 또는 `webkitSpeechRecognition`을 사용했다.

핵심 코드는 `app.js`에 있다.

```js
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
```

브라우저마다 표준 이름이 다를 수 있기 때문에 두 이름을 모두 확인한다.

음성 인식 설정은 다음처럼 구성했다.

```js
recognition.lang = "ko-KR";
recognition.continuous = true;
recognition.interimResults = true;
recognition.maxAlternatives = 1;
```

각 설정의 의미는 다음과 같다.

- `lang = "ko-KR"`: 한국어 음성으로 인식한다.
- `continuous = true`: 한 문장만 듣고 끝내지 않고 계속 듣도록 요청한다.
- `interimResults = true`: 말하는 중간 결과도 화면에 잠깐 보여준다.
- `maxAlternatives = 1`: 가장 가능성 높은 인식 결과 하나만 사용한다.

단, `continuous = true`라고 해도 브라우저가 영원히 듣는다는 뜻은 아니다. 모바일 브라우저는 배터리, 보안, 권한 정책 때문에 중간에 인식을 끊을 수 있다. 그래서 `recognition.onend`에서 사용자가 아직 듣는 중이라면 다시 시작하도록 처리했다.

```js
recognition.onend = () => {
  if (isListening) {
    window.setTimeout(() => {
      recognition.start();
    }, 400);
  }
};
```

## 6. 문장 저장 원리

음성 인식 결과가 최종 문장으로 확정되면 `addUtterance` 함수가 호출된다.

이 함수는 다음 일을 한다.

1. 인식된 텍스트를 문장 단위로 나눈다.
2. 공백과 문장 부호를 정리한다.
3. 너무 짧은 문장은 버린다.
4. 문장, 정규화된 문장, 저장 시각을 객체로 만든다.
5. 브라우저의 `localStorage`에 저장한다.

저장되는 데이터 형태는 대략 다음과 같다.

```json
{
  "id": "랜덤 ID",
  "text": "오늘 너무 피곤해",
  "normalized": "오늘 너무 피곤해",
  "createdAt": "2026-06-14T11:52:00.000Z"
}
```

여기서 `text`는 화면에 보여줄 원문이고, `normalized`는 같은 문장인지 비교하기 위한 값이다.

## 7. localStorage를 사용한 이유

첫 버전에서는 서버 데이터베이스를 만들지 않았다. 대신 브라우저 안에 있는 `localStorage`를 사용했다.

장점은 다음과 같다.

- 별도 서버가 필요 없다.
- 사용자의 문장이 외부 서버에 자동 저장되지 않는다.
- 구현이 단순하다.

단점도 있다.

- 같은 휴대폰, 같은 브라우저 안에서만 기록이 유지된다.
- 브라우저 데이터를 삭제하면 기록도 지워진다.
- 여러 기기 간 동기화는 되지 않는다.

학습용 첫 버전에서는 개인정보와 단순성을 우선해서 `localStorage`를 선택했다.

## 8. 자주 말한 문장 분석 원리

자주 말한 문장은 `buildFrequency` 함수에서 계산한다.

원리는 단순하다.

1. 저장된 문장을 하나씩 읽는다.
2. 정규화된 문장을 기준으로 그룹을 만든다.
3. 같은 문장이 나오면 `count`를 1씩 올린다.
4. 많이 나온 순서대로 정렬한다.
5. 상위 10개를 화면에 보여준다.

예를 들어 다음 문장이 저장되어 있다고 하자.

```text
오늘 너무 피곤해
오늘 너무 피곤해.
나중에 전화할게
```

마침표를 제거하고 정규화하면 첫 번째와 두 번째 문장은 같은 문장으로 계산된다. 그래서 `오늘 너무 피곤해`가 2회로 표시된다.

## 9. 영어 문장 만들기 원리

영어 문장은 두 가지 방식으로 만들 수 있게 했다.

첫 번째는 프롬프트 복사 방식이다.

앱이 자주 말한 한국어 문장을 모아 다음과 같은 프롬프트를 만든다.

```text
아래는 오늘 내가 한국어로 자주 말한 문장입니다.

각 문장을 자연스러운 영어로 바꾸고, 너무 직역하지 말고 실제 회화에서 쓸 표현으로 정리해 주세요.
출력 형식:
- 한국어
- 자연스러운 영어
- 더 공손한 표현
- 짧은 발음/사용 팁

문장:
1. 오늘 너무 피곤해 (3회)
2. 나중에 전화할게 (2회)
```

이 프롬프트를 복사해서 ChatGPT 같은 도구에 붙여 넣을 수 있다.

두 번째는 OpenAI API 직접 호출 방식이다.

API 키를 입력하고 `영어로 정리`를 누르면 브라우저에서 OpenAI Responses API로 요청한다.

```js
fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  },
  body: JSON.stringify({
    model,
    input: buildPrompt(sentences)
  })
});
```

API 키는 앱 저장소에 남기지 않도록 했다. 보안상 브라우저에 오래 저장하는 것이 좋지 않기 때문이다.

## 10. PWA 설정 원리

PWA로 동작하려면 보통 두 가지가 필요하다.

1. `manifest.webmanifest`
2. 서비스 워커 `sw.js`

`manifest.webmanifest`는 앱의 이름, 아이콘, 시작 주소, 표시 방식을 정의한다.

```json
{
  "name": "영어 문장 만들기",
  "short_name": "영어문장",
  "start_url": "./index.html",
  "display": "standalone"
}
```

`display: "standalone"`은 홈 화면에서 실행했을 때 일반 브라우저 탭보다 앱처럼 보이도록 요청하는 설정이다.

`sw.js`는 주요 파일을 캐시한다.

```js
const assets = ["./", "./index.html", "./styles.css", "./app.js"];
```

서비스 워커 덕분에 앱을 한 번 연 뒤에는 일부 파일을 빠르게 다시 열 수 있다.

## 11. 로컬 테스트 절차

처음 만든 뒤에는 로컬에서 문법과 HTTP 응답을 확인했다.

문법 확인:

```powershell
node --check app.js
node --check server.js
```

로컬 서버 실행:

```powershell
npm start
```

브라우저에서 확인:

```text
http://localhost:4173
```

HTTP 응답 확인:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:4173
Invoke-WebRequest -UseBasicParsing http://localhost:4173/app.js
Invoke-WebRequest -UseBasicParsing http://localhost:4173/styles.css
```

이 과정에서 `server.js`의 경로 처리 문제가 한 번 발견됐다. 루트 주소 `/`가 `index.html`로 잘 연결되도록 경로 계산을 수정했다.

## 12. Git 저장소 준비

GitHub에 올리기 위해 로컬 폴더를 Git 저장소로 만들었다.

```powershell
git init
git add .
git commit -m "Initial GitHub Pages app"
```

이때 GitHub Pages용으로 `.nojekyll`도 추가했다.

GitHub Pages는 기본적으로 Jekyll이라는 정적 사이트 도구를 거쳐 배포할 수 있다. 이 앱은 순수 HTML, CSS, JavaScript 파일만 쓰므로 Jekyll 처리가 필요 없다. 그래서 `.nojekyll` 파일을 넣어 그대로 배포되게 했다.

## 13. GitHub 저장소 생성

Chrome에서 GitHub에 로그인한 뒤 새 저장소를 만들었다.

설정은 다음과 같이 했다.

- 계정: `ldkmc20`
- 저장소 이름: `english-sentence-maker`
- 공개 여부: Public
- README, .gitignore, license 자동 생성: 사용하지 않음

저장소 주소:

```text
https://github.com/ldkmc20/english-sentence-maker
```

## 14. GitHub로 업로드

로컬 저장소의 기본 브랜치를 `main`으로 바꾸고 GitHub 원격 저장소를 연결했다.

```powershell
git branch -M main
git remote add origin https://github.com/ldkmc20/english-sentence-maker.git
git push -u origin main
```

이 작업으로 로컬의 앱 파일들이 GitHub 저장소에 올라갔다.

## 15. GitHub Pages 활성화

GitHub 저장소의 설정 화면에서 Pages를 켰다.

경로:

```text
Settings → Pages
```

설정값:

- Source: Deploy from a branch
- Branch: `main`
- Folder: `/ (root)`

저장 후 GitHub가 Pages 빌드를 시작했다. 잠시 후 설정 화면에 다음 주소가 표시됐다.

```text
https://ldkmc20.github.io/english-sentence-maker/
```

## 16. 배포 확인

최종 배포 주소를 Chrome에서 열어 확인했다.

```text
https://ldkmc20.github.io/english-sentence-maker/
```

확인한 내용은 다음과 같다.

- 페이지 제목이 `영어 문장 만들기`로 표시된다.
- `녹음 시작` 버튼이 보인다.
- `오늘 말한 한국어`, `많이 쓴 문장`, `영어 문장 정리` 영역이 보인다.
- 콘솔 오류가 없다.
- HTTPS 주소로 열리므로 휴대폰에서 마이크 권한 요청이 가능하다.

처음 접속했을 때는 `Site not found`가 잠깐 표시됐다. GitHub Pages는 설정 직후 배포가 완료되기까지 시간이 걸릴 수 있기 때문이다. 설정 화면에서 live 상태를 확인한 뒤 다시 새로고침하니 정상적으로 앱이 열렸다.

## 17. 휴대폰에서 사용하는 방법

갤럭시 S25 플러스에서 다음 주소를 연다.

```text
https://ldkmc20.github.io/english-sentence-maker/
```

권장 사용 절차:

1. Chrome 또는 Samsung Internet에서 주소를 연다.
2. 필요하면 브라우저 메뉴에서 홈 화면에 추가한다.
3. 앱을 열고 `녹음 시작`을 누른다.
4. 마이크 권한을 허용한다.
5. 한국어로 말한다.
6. 자주 말한 문장이 쌓이면 `영어로 정리` 또는 `프롬프트 복사`를 사용한다.

## 18. 현재 버전의 한계

이 첫 버전은 학습과 실험에 적합하지만 한계가 있다.

- 화면이 꺼지면 음성 인식이 멈출 수 있다.
- 브라우저가 백그라운드로 가면 음성 인식이 중단될 수 있다.
- 문장 유사도 분석은 단순한 문자열 비교에 가깝다.
- "밥 먹었어"와 "밥 먹었어요"를 같은 의미로 묶지는 못한다.
- API 키를 브라우저에서 직접 사용하므로 공개 장소나 공유 기기에서는 주의해야 한다.
- 데이터는 현재 브라우저에만 저장된다.

## 19. 다음 단계 아이디어

더 발전시키려면 다음 기능을 추가할 수 있다.

- 유사 문장 묶기: 의미가 비슷한 문장을 하나의 대표 문장으로 합치기
- 날짜별 기록: 오늘, 어제, 이번 주 단위로 문장 보기
- 발음 연습: 영어 문장을 음성으로 읽어 주기
- CSV 또는 Excel 내보내기
- OpenAI API를 서버를 통해 호출해서 API 키를 브라우저에 입력하지 않게 하기
- 네이티브 Android 앱으로 확장해서 포그라운드 서비스와 알림 추가하기

## 20. 전체 흐름 요약

전체 제작 흐름은 다음과 같다.

```text
요구 사항 분석
→ PWA 방식 선택
→ HTML 화면 작성
→ CSS 디자인 작성
→ JavaScript 음성 인식 구현
→ localStorage 저장 구현
→ 빈도 분석 구현
→ OpenAI 프롬프트/API 연동 구현
→ PWA manifest와 service worker 추가
→ 로컬 서버로 테스트
→ Git 저장소 생성
→ GitHub 저장소 생성
→ 파일 push
→ GitHub Pages 활성화
→ HTTPS 배포 주소 확인
```

이 앱의 핵심 원리는 복잡하지 않다. 브라우저가 한국어 음성을 텍스트로 바꾸고, 앱은 그 텍스트를 로컬에 저장한 뒤, 같은 문장이 몇 번 나왔는지 세고, 그 결과를 영어 학습용 프롬프트로 바꾸는 구조다.

## 21. 23시 자동 정리 기능으로 수정한 내용

이후 요구 사항에 맞춰 앱을 한 번 더 수정했다.

수정 요청의 핵심은 다음과 같았다.

- 녹음 시작을 누르면 마이크가 바로 작동하기를 원한다.
- 모든 말을 바로 영어로 번역하지 않는다.
- 우선 한국어 말을 텍스트로 저장해 둔다.
- 저녁 11시에 저장된 말 중 많이 한 말이나 실제 생활에서 일반적으로 하는 말만 영어로 번역한다.

여기서 마이크 권한 부분은 중요한 제한이 있다. Android와 Chrome/Samsung Internet은 웹사이트가 사용자 승인 없이 마이크를 켜는 것을 허용하지 않는다. 앱 코드로 이 보안 정책을 우회할 수 없다. 그래서 앱에는 "마이크 권한은 사용자가 한 번 허용해야 한다"는 안내를 넣었다. 한 번 허용된 뒤에는 사용자가 `녹음 시작`을 눌러 학습 세션을 시작한다.

자동 정리 기능은 다음 구조로 만들었다.

```text
음성 인식
→ 한국어 텍스트 저장
→ 대표 후보 문장 계산
→ 23:00 확인
→ OpenAI API 키가 있으면 영어 정리 요청
→ API 키가 없으면 복사용 프롬프트 생성
```

대표 후보 문장은 단순히 모든 문장을 번역하지 않기 위해 추가한 개념이다. 앱은 저장된 문장을 다음 기준으로 점수화한다.

- 같은 문장이 여러 번 반복되었는가
- 실제 생활 표현에 자주 나오는 단어가 들어 있는가
- 너무 길지 않고 회화 문장처럼 보이는가
- 질문이나 요청처럼 영어 회화 연습에 쓸 만한가

예를 들어 다음과 같은 말은 대표 후보가 되기 쉽다.

```text
나중에 전화할게
오늘 너무 피곤해
잠깐만 기다려줘
어디 가?
고마워
```

반면 하루 동안 한 모든 말을 그대로 번역하지는 않는다.

23시 자동 정리는 브라우저 앱의 한계 안에서 구현했다. 웹앱은 휴대폰에서 완전히 닫혀 있으면 정확히 23:00에 백그라운드 작업을 실행할 수 없다. 그래서 다음 두 경우에 실행되도록 했다.

- 앱이 23:00에 열려 있으면 그 시점에 자동 실행한다.
- 앱이 닫혀 있었다면, 23:00 이후 다시 열 때 그날 정리가 아직 없으면 실행한다.

OpenAI API 키는 보안을 위해 저장하지 않는다. 따라서 23시에 실제 영어 번역까지 자동으로 보내려면 앱이 열려 있고 API 키 입력칸에 키가 들어 있어야 한다. API 키가 없으면 앱은 번역 요청 대신 복사해서 다른 AI 도구에 붙여 넣을 수 있는 프롬프트를 만들어 둔다.
