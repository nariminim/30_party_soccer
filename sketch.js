// 팀 대결: 기울기 축구 → 흔들기 대결 → 연타 대결 → 다시 축구 ... (p5.party + 핸드폰 센서)
//
// 무대(프로젝터): 주소 끝에 ?stage=1 을 붙여서 연다 → 게임 진행 + 화면 (교수자 1명만!)
// 컨트롤러(핸드폰): 그냥 주소로 연다 → 이름 쓰고 팀 고르기
//
// 1. 기울기 축구: 핸드폰을 기울여 공을 민다. A팀(주황)은 오른쪽, B팀(파랑)은 왼쪽 골대로. 3골 먼저 넣으면 승리
// 2. 흔들기 대결: 핸드폰을 열심히 흔든다. 팀 게이지를 먼저 채우면 승리
// 3. 연타 대결: 화면의 큰 버튼을 최대한 빨리 탭한다. 팀 게이지를 먼저 채우면 승리
// 한 게임이 끝나면 승리 팀을 보여주고 다음 게임으로 넘어감
// 모두 접속하면 무대의 [게임 시작] 버튼으로 시작
// 무대 키보드: N = 다음 게임으로 / R = 처음(대기실)으로

let room = "class"; // ✏️ 방 이름
let WIN_GOALS = 3; // ✏️ 축구: 몇 골 먼저 넣으면 승리
let SHAKE_TARGET = 30; // ✏️ 흔들기: 팀원 1명당 평균 몇 번 흔들면 승리
let TAP_TARGET = 60; // ✏️ 연타: 팀원 1명당 평균 몇 번 탭하면 승리
let SHAKE_HIGH = 25; // ✏️ 흔들기 감지: 이보다 세게 움직이면 1번으로 셈
let SHAKE_LOW = 10; //    다시 이보다 약해져야 다음 1번을 셈

let isStage = false; // 무대인지 컨트롤러인지
let game; // 모두가 함께 보는 게임 상태: 무대만 바꿈
let me; // 내 데이터 (팀, 이름, 기울기, 흔들거나 탭한 횟수): 나만 바꿈
let guests; // 접속한 모든 사람의 데이터

// 컨트롤러(핸드폰)용
let nameInput, btnA, btnB, btnReset;
let baseX = 0; // 기준 자세: 처음 들고 있던 기울기를 0으로 삼기
let baseY = 0;
let calibrated = false;
let myCount = 0; // 이번 게임에서 내가 흔들거나 탭한 횟수
let shakeUp = false; // 지금 세게 흔드는 중인지
let pulse = 0; // 1번 셀 때마다 번쩍이는 효과
let myRound = -1; // 내가 알고 있는 게임 번호

// 무대용
let startBtn; // 게임 시작 버튼
let phaseStart = 0; // 지금 단계가 시작된 시간
let bx = 0.5; // 공 위치와 속도 (경기장 크기에 대한 0~1 비율)
let by = 0.5;
let vx = 0;
let vy = 0;
let goalTop = 0.35; // 골대 입구 범위 (위~아래)
let goalBottom = 0.65;
let goalTime = 0;
let lastCheck = 0; // 고착 확인용: 3초 전 공 위치
let lastBx = 0.5;
let lastBy = 0.5;
let showA = 0; // 게이지가 부드럽게 차오르도록 화면에 보여줄 값
let showB = 0;

async function setup() {
  createCanvas(windowWidth, windowHeight);
  angleMode(DEGREES); // 기울기를 '도' 단위로
  textAlign(CENTER, CENTER);
  isStage = getURLParams().stage === "1"; // 주소에 ?stage=1 이 있으면 무대

  // 서버 접속 + 공유 데이터 불러오기
  await partyConnect("wss://demoserver.p5party.org", "interactive2_teamgame", room);
  game = await partyLoadShared("game", {
    mode: "soccer", // 지금 게임: "soccer"(축구) / "shake"(흔들기) / "tap"(연타)
    phase: "lobby", // 단계: "lobby"(대기실) → "ready"(카운트다운) → "play"(경기) → "win"(승리 발표)
    round: 0, // 게임 번호 (새 게임마다 +1)
    scoreA: 0, // 축구 점수
    scoreB: 0,
    gaugeA: 0, // 흔들기 게이지 (0~1)
    gaugeB: 0,
    winsA: 0, // 이긴 게임 수
    winsB: 0,
    winner: "",
    msg: "", // 화면 가운데 큰 글자
  });
  me = await partyLoadMyShared({ stage: isStage, team: "", name: "", tx: 0, ty: 0, count: 0 });
  guests = partyLoadGuestShareds();

  if (isStage === true) {
    startBtn = createButton("게임 시작");
    startBtn.size(260, 70);
    startBtn.position(width / 2 - 130, height - 230);
    startBtn.style("font-size", "28px");
    startBtn.style("border", "none");
    startBtn.style("border-radius", "16px");
    startBtn.mouseClicked(startPressed);
    goLobby();
  } else {
    makeButtons();
  }
}

function draw() {
  if (isStage === true) {
    drawStage();
  } else {
    drawController();
  }
}

// ===============================================================
// 함께 쓰는 함수들
// ===============================================================

// 한 팀의 선수들만 모으기 (무대는 빼고)
function teamPlayers(team) {
  let players = [];
  for (let g of guests) {
    if (g.team === team && g.stage !== true) {
      players.push(g);
    }
  }
  return players;
}

// 축구: 팀 전체의 힘
// x, y: 팀원 기울기의 평균 → 팀이 공을 미는 방향과 세기
// together: 한마음 지수 (0~1). 모두 같은 방향으로 기울이면 1에 가까워짐
function teamForce(team) {
  let players = teamPlayers(team);
  let sumX = 0;
  let sumY = 0;
  let sumLen = 0;
  for (let p of players) {
    sumX += p.tx;
    sumY += p.ty;
    sumLen += mag(p.tx, p.ty);
  }
  let n = players.length;
  if (n === 0) {
    return { x: 0, y: 0, together: 0, n: 0 };
  }
  let x = sumX / n;
  let y = sumY / n;
  let together = 0;
  if (sumLen > 0) {
    together = mag(x, y) / (sumLen / n);
  }
  return { x: x, y: y, together: together, n: n };
}

// 다음 게임: 축구 → 흔들기 → 연타 → 축구 ...
function nextMode(mode) {
  if (mode === "soccer") return "shake";
  if (mode === "shake") return "tap";
  return "soccer";
}

// 흔들기/연타의 목표 횟수
function targetFor(mode) {
  if (mode === "shake") return SHAKE_TARGET;
  return TAP_TARGET;
}

function teamColor(team) {
  if (team === "A") {
    return color(255, 130, 50);
  } else {
    return color(50, 130, 255);
  }
}

// 화살표 그리기: (x, y)에서 (dx, dy)만큼
function drawArrow(x, y, dx, dy, col, w) {
  if (mag(dx, dy) < 2) return;
  push();
  stroke(col);
  strokeWeight(w);
  translate(x, y);
  line(0, 0, dx, dy);
  translate(dx, dy);
  rotate(atan2(dy, dx));
  noStroke();
  fill(col);
  triangle(0, -w * 1.5, 0, w * 1.5, w * 2.5, 0);
  pop();
}

// 가로 게이지 그리기
function drawBar(x, y, w, h, amount, col) {
  noStroke();
  fill(255, 255, 255, 120);
  rect(x, y, w, h, h / 2);
  fill(col);
  rect(x, y, w * constrain(amount, 0, 1), h, h / 2);
}

// ===============================================================
// 컨트롤러 (핸드폰)
// ===============================================================
function makeButtons() {
  nameInput = createInput("");
  nameInput.attribute("placeholder", "내 이름 (2~3글자)");
  nameInput.position(20, 20);
  nameInput.size(width - 40, 36);

  btnA = createButton("A팀");
  btnA.position(20, 90);
  btnA.size(width / 2 - 30, height - 120);
  btnA.style("background", "rgb(255,130,50)");
  btnA.style("color", "white");
  btnA.style("font-size", "32px");
  btnA.style("border", "none");
  btnA.style("border-radius", "16px");
  btnA.mouseClicked(chooseA); // 아이폰 센서 권한은 '클릭'에서만 요청 가능

  btnB = createButton("B팀");
  btnB.position(width / 2 + 10, 90);
  btnB.size(width / 2 - 30, height - 120);
  btnB.style("background", "rgb(50,130,255)");
  btnB.style("color", "white");
  btnB.style("font-size", "32px");
  btnB.style("border", "none");
  btnB.style("border-radius", "16px");
  btnB.mouseClicked(chooseB);

  btnReset = createButton("지금 자세를 기준으로");
  btnReset.position(20, height - 70);
  btnReset.size(width - 40, 50);
  btnReset.mouseClicked(calibrate);
  btnReset.hide();
}

function chooseA() {
  chooseTeam("A");
}

function chooseB() {
  chooseTeam("B");
}

function chooseTeam(team) {
  askPermission();
  me.team = team;
  me.name = nameInput.value();
  if (me.name === "") {
    me.name = "" + floor(random(10, 100)); // 이름이 없으면 아무 숫자
  }
  nameInput.hide();
  btnA.hide();
  btnB.hide();
}

// 아이폰 센서 권한 요청 (p5에 이 기능이 없어서 자바스크립트 그대로. 건드리지 않아도 되는 부분)
function askPermission() {
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    DeviceMotionEvent.requestPermission();
    DeviceOrientationEvent.requestPermission();
  }
}

// 지금 들고 있는 자세를 '기울기 0'으로 삼기
function calibrate() {
  if (rotationX === null) return; // 센서값이 아직 없으면 (null) 기다리기
  baseX = rotationX;
  baseY = rotationY;
  calibrated = true;
}

function drawController() {
  if (me.team === "") {
    background(30); // 팀 고르기 전
    return;
  }

  // 센서값이 처음 들어오면 그때 자세를 기준으로
  if (calibrated === false && rotationX !== null && (rotationX !== 0 || rotationY !== 0)) {
    calibrate();
  }

  // 새 게임이 시작되면 내 흔든 횟수를 0으로
  if (game.round !== myRound) {
    myRound = game.round;
    myCount = 0;
    me.count = 0;
  }

  let c = teamColor(me.team);
  background(lerpColor(c, color(255), 0.75)); // 우리 팀 색 배경

  // 대기실: 게임 시작 전
  if (game.phase === "lobby") {
    btnReset.hide();
    fill(0);
    noStroke();
    textSize(26);
    text(me.name + " · " + me.team + "팀", width / 2, 40);
    textSize(40);
    text("곧 시작합니다", width / 2, height * 0.4);
    textSize(18);
    text("A팀 " + teamPlayers("A").length + "명 · B팀 " + teamPlayers("B").length + "명 접속", width / 2, height * 0.4 + 60);
    textSize(14);
    text("핸드폰은 세로로, 화면 회전 잠금을 켜 주세요", width / 2, height - 60);
    return;
  }

  if (game.mode === "soccer") {
    btnReset.show();
    drawSoccerController(c);
  } else if (game.mode === "shake") {
    btnReset.hide();
    drawShakeController(c);
  } else {
    btnReset.hide();
    drawTapController(c);
  }

  // 위: 내 이름 + 이긴 게임 수
  fill(0);
  noStroke();
  textSize(26);
  text(me.name + " · " + me.team + "팀", width / 2, 40);
  textSize(16);
  text("이긴 게임  A " + game.winsA + " : " + game.winsB + " B", width / 2, 75);

  // 가운데 큰 글자 (카운트다운, 골, 승리)
  if (game.phase === "win") {
    textSize(40);
    if (game.winner === me.team) {
      text("우리 팀 승리!", width / 2, height * 0.3);
    } else {
      text("다음 게임에서\n이기자!", width / 2, height * 0.3);
    }
  } else if (game.msg !== "") {
    textSize(56);
    text(game.msg, width / 2, height * 0.3);
  }
}

// 축구 컨트롤러: 기울이기
function drawSoccerController(c) {
  // 1. 내 기울기 → -1 ~ 1 (30도 기울이면 최대)
  let tx = constrain((rotationY - baseY) / 30, -1, 1); // 좌우로 기울이기
  let ty = constrain((rotationX - baseX) / 30, -1, 1); // 앞뒤로 기울이기

  // 2. 서버로 보내기: 25명이 매 프레임 보내면 서버가 힘드니 6프레임에 한 번만
  if (frameCount % 6 === 0) {
    me.tx = round(tx, 1);
    me.ty = round(ty, 1);
  }

  // 3. 우리 팀 화살표 (굵고 연하게) + 내 화살표 (검정)
  let team = teamForce(me.team);
  let r = min(width, height) * 0.28;
  let cy = height * 0.55;
  drawArrow(width / 2, cy, team.x * r, team.y * r, color(red(c), green(c), blue(c), 160), 20);
  drawArrow(width / 2, cy, tx * r, ty * r, color(0), 8);
  fill(0);
  noStroke();
  circle(width / 2, cy, 16);

  textSize(18);
  text("축구  A " + game.scoreA + " : " + game.scoreB + " B   (" + WIN_GOALS + "골 먼저)", width / 2, 110);
  text("우리 팀 " + team.n + "명 · 한마음 " + round(team.together * 100) + "%", width / 2, height - 130);
  textSize(14);
  text("검은 화살표: 나 / 굵은 화살표: 우리 팀 전체", width / 2, height - 100);
}

// 흔들기 컨트롤러: 흔들기
function drawShakeController(c) {
  // 1. 지금 얼마나 세게 움직이는지
  let power = abs(accelerationX) + abs(accelerationY) + abs(accelerationZ);

  // 2. 세게 흔들었다가 → 약해지면 1번으로 세기 (경기 중일 때만)
  if (game.phase === "play") {
    if (power > SHAKE_HIGH && shakeUp === false) {
      myCount++;
      shakeUp = true;
      pulse = 1;
    }
    if (power < SHAKE_LOW) {
      shakeUp = false;
    }
  }
  if (frameCount % 6 === 0) {
    me.count = myCount; // 서버로 보내기
  }

  // 3. 나: 흔들 때마다 커지는 원 + 지금 세기 + 횟수
  pulse = pulse * 0.85;
  let cy = height * 0.55;
  noStroke();
  fill(red(c), green(c), blue(c), 200);
  circle(width / 2, cy, 120 + pulse * 120);
  fill(255);
  textSize(48);
  text(myCount, width / 2, cy);
  fill(0);
  textSize(16);
  text("내가 흔든 횟수", width / 2, cy + 100);
  drawBar(40, cy + 125, width - 80, 12, power / SHAKE_HIGH, color(0));

  textSize(18);
  text("흔들어서 우리 팀 게이지를 채워라!", width / 2, 110);
  drawTeamGauges();
}

// 연타 컨트롤러: 큰 버튼 탭하기 (세는 건 아래 mousePressed에서)
function drawTapController(c) {
  if (frameCount % 6 === 0) {
    me.count = myCount; // 서버로 보내기
  }

  // 큰 버튼: 누를 때마다 눌린 듯 작아졌다 돌아옴
  pulse = pulse * 0.7;
  let cy = height * 0.55;
  noStroke();
  fill(red(c), green(c), blue(c), 230);
  circle(width / 2, cy, 220 - pulse * 30);
  fill(255);
  textSize(48);
  text(myCount, width / 2, cy - 10);
  textSize(18);
  text("TAP!", width / 2, cy + 35);

  fill(0);
  textSize(18);
  text("버튼을 최대한 빨리 탭해라!", width / 2, 110);
  drawTeamGauges();
}

// 화면을 누를 때마다 (연타 대결 중, 버튼 안을 눌렀을 때만 1번)
function mousePressed() {
  if (isStage === true || me === undefined || me.team === "") return;
  if (game.mode === "tap" && game.phase === "play") {
    if (dist(mouseX, mouseY, width / 2, height * 0.55) < 110) {
      myCount++;
      pulse = 1;
    }
  }
}

// 두 팀 게이지 (팀원 평균이 목표에 얼마나 가까운지)
function drawTeamGauges() {
  fill(0);
  textSize(16);
  textAlign(LEFT, CENTER);
  text("A", 24, height - 120);
  text("B", 24, height - 80);
  textAlign(CENTER, CENTER);
  drawBar(50, height - 130, width - 90, 20, game.gaugeA, teamColor("A"));
  drawBar(50, height - 90, width - 90, 20, game.gaugeB, teamColor("B"));
}

// ===============================================================
// 무대 (프로젝터): 게임 진행을 맡음
// ===============================================================
// 대기실로: 시작 버튼 보이기
function goLobby() {
  game.phase = "lobby";
  game.mode = "soccer";
  game.msg = "";
  startBtn.show();
}

// [게임 시작] 버튼
function startPressed() {
  startBtn.hide();
  game.winsA = 0;
  game.winsB = 0;
  startGame("soccer");
}

function startGame(mode) {
  game.mode = mode;
  game.round = game.round + 1;
  game.scoreA = 0;
  game.scoreB = 0;
  game.gaugeA = 0;
  game.gaugeB = 0;
  game.winner = "";
  showA = 0;
  showB = 0;
  resetBall();
  setPhase("ready");
}

function setPhase(phase) {
  game.phase = phase;
  phaseStart = millis();
}

function setMsg(m) {
  if (game.msg !== m) {
    game.msg = m; // 바뀔 때만 보내기
  }
}

function win(team) {
  game.winner = team;
  if (team === "A") {
    game.winsA = game.winsA + 1;
  } else {
    game.winsB = game.winsB + 1;
  }
  setMsg(team + "팀 승리!");
  setPhase("win");
}

// 단계 넘기기: 준비(3, 2, 1) → 경기 → 승리 발표(5초) → 다음 게임
function updateFlow() {
  let t = millis() - phaseStart;
  if (game.phase === "ready") {
    let count = 3 - floor(t / 1000);
    if (count > 0) {
      setMsg("" + count);
    } else {
      setMsg("");
      setPhase("play");
    }
  }
  if (game.phase === "win" && t > 5000) {
    startGame(nextMode(game.mode));
  }
}

function drawStage() {
  background(25);
  if (game.phase === "lobby") {
    drawLobby();
    return;
  }
  updateFlow();

  if (game.mode === "soccer") {
    if (game.phase === "play") {
      updateSoccer();
    }
    drawSoccerStage();
  } else {
    if (game.phase === "play") {
      updateRace();
    }
    drawRaceStage();
  }

  // 위: 이긴 게임 수
  noStroke();
  fill(255);
  textSize(16);
  text("이긴 게임   A " + game.winsA + " : " + game.winsB + " B", width / 2, 80);

  // 가운데 큰 글자
  if (game.msg !== "") {
    fill(255);
    textSize(100);
    text(game.msg, width / 2, height / 2 - 40);
  }
}

// ---------- 대기실 ----------
function drawLobby() {
  noStroke();
  fill(255);
  textSize(48);
  text("팀 대결", width / 2, 70);
  textSize(20);
  text("핸드폰으로 접속해서 이름을 쓰고 팀을 고르세요", width / 2, 125);
  textSize(36);
  fill(teamColor("A"));
  text("A팀 " + teamPlayers("A").length + "명", width / 4, height / 2 - 60);
  fill(teamColor("B"));
  text("B팀 " + teamPlayers("B").length + "명", (width * 3) / 4, height / 2 - 60);
  drawPlayers("A", 0, height - 110);
  drawPlayers("B", width / 2, height - 110);
}

// ---------- 기울기 축구 ----------
function resetBall() {
  bx = 0.5;
  by = 0.5;
  vx = 0;
  vy = 0;
  lastBx = 0.5;
  lastBy = 0.5;
  lastCheck = millis();
}

function updateSoccer() {
  let A = teamForce("A");
  let B = teamForce("B");

  // 1. 공 움직이기: 두 팀이 미는 힘을 더한 만큼
  vx += (A.x + B.x) * 0.0002;
  vy += (A.y + B.y) * 0.0002;
  vx *= 0.97; // 마찰
  vy *= 0.97;
  bx += vx;
  by += vy;

  // 위아래 벽에 튕기기
  if (by < 0) {
    by = 0;
    vy = -vy;
  }
  if (by > 1) {
    by = 1;
    vy = -vy;
  }
  // 좌우: 골대 입구면 골, 아니면 튕기기
  if (bx > 1) {
    if (by > goalTop && by < goalBottom) {
      goal("A"); // 오른쪽 골대 → A팀 득점
    } else {
      bx = 1;
      vx = -vx;
    }
  }
  if (bx < 0) {
    if (by > goalTop && by < goalBottom) {
      goal("B"); // 왼쪽 골대 → B팀 득점
    } else {
      bx = 0;
      vx = -vx;
    }
  }

  // 2. 고착 막기: 3초 동안 공이 거의 안 움직였으면 가운데서 아무 방향으로 다시 출발
  if (millis() - lastCheck > 3000) {
    if (dist(bx, by, lastBx, lastBy) < 0.05) {
      resetBall();
      vx = random(-0.015, 0.015);
      vy = random(-0.015, 0.015);
    }
    lastCheck = millis();
    lastBx = bx;
    lastBy = by;
  }

  // 골 메시지는 2초 뒤 지우기
  if (game.msg !== "" && millis() - goalTime > 2000) {
    setMsg("");
  }
}

function goal(team) {
  if (team === "A") {
    game.scoreA = game.scoreA + 1;
  } else {
    game.scoreB = game.scoreB + 1;
  }
  resetBall();
  if (game.scoreA >= WIN_GOALS || game.scoreB >= WIN_GOALS) {
    win(team);
  } else {
    setMsg(team + "팀 골!");
    goalTime = millis();
  }
}

function drawSoccerStage() {
  let A = teamForce("A");
  let B = teamForce("B");
  let fy = 110; // 경기장 위치와 크기 (위: 점수, 아래: 관중석)
  let fh = height - fy - 140;

  // 경기장
  noStroke();
  fill(40, 120, 60);
  rect(0, fy, width, fh);
  stroke(255, 120);
  strokeWeight(3);
  line(width / 2, fy, width / 2, fy + fh);
  noFill();
  circle(width / 2, fy + fh / 2, fh * 0.3);

  // 골대 (지키는 팀 색): 왼쪽은 A팀이 지킴, 오른쪽은 B팀이 지킴
  noStroke();
  fill(teamColor("A"));
  rect(0, fy + fh * goalTop, 14, fh * (goalBottom - goalTop));
  fill(teamColor("B"));
  rect(width - 14, fy + fh * goalTop, 14, fh * (goalBottom - goalTop));

  // 공 + 팀별 화살표 (팀 전체가 미는 방향과 세기)
  let x = bx * width;
  let y = fy + by * fh;
  drawArrow(x, y, A.x * 200, A.y * 200, teamColor("A"), 10);
  drawArrow(x, y, B.x * 200, B.y * 200, teamColor("B"), 10);
  noStroke();
  fill(255);
  circle(x, y, 40);

  // 점수 + 팀 정보
  textSize(40);
  fill(teamColor("A"));
  text("A  " + game.scoreA, width / 2 - 100, 40);
  fill(teamColor("B"));
  text(game.scoreB + "  B", width / 2 + 100, 40);
  textSize(16);
  fill(teamColor("A"));
  text(A.n + "명 · 한마음 " + round(A.together * 100) + "% · 오른쪽으로 →", width / 4, 40);
  fill(teamColor("B"));
  text("← 왼쪽으로 · " + B.n + "명 · 한마음 " + round(B.together * 100) + "%", (width * 3) / 4, 40);

  // 관중석
  drawPlayers("A", 0, height - 110);
  drawPlayers("B", width / 2, height - 110);
}

// ---------- 흔들기 대결 / 연타 대결 (같은 방식: 횟수로 게이지 채우기) ----------
function updateRace() {
  // 팀원들의 평균 횟수 → 목표 대비 몇 %인지
  let target = targetFor(game.mode);
  let a = teamCount("A");
  let b = teamCount("B");
  if (frameCount % 6 === 0) {
    game.gaugeA = round(min(a / target, 1), 2);
    game.gaugeB = round(min(b / target, 1), 2);
  }
  if (a >= target) {
    game.gaugeA = 1;
    win("A");
  } else if (b >= target) {
    game.gaugeB = 1;
    win("B");
  }
}

// 팀원 1명당 평균 횟수 (인원이 달라도 공평하게)
function teamCount(team) {
  let players = teamPlayers(team);
  if (players.length === 0) return 0;
  let sum = 0;
  for (let p of players) {
    sum += p.count;
  }
  return sum / players.length;
}

function drawRaceStage() {
  // 게이지가 부드럽게 차오르도록
  showA = lerp(showA, game.gaugeA, 0.2);
  showB = lerp(showB, game.gaugeB, 0.2);

  noStroke();
  fill(255);
  textSize(36);
  if (game.mode === "shake") {
    text("흔들기 대결!  핸드폰을 흔들어 먼저 채우는 팀이 승리", width / 2, 40);
  } else {
    text("연타 대결!  버튼을 탭해서 먼저 채우는 팀이 승리", width / 2, 40);
  }

  // 두 팀의 큰 게이지 (아래에서 위로 차오름)
  let top = 120;
  let h = height - top - 170;
  let w = width * 0.2;
  drawTank(width * 0.25 - w / 2, top, w, h, showA, "A");
  drawTank(width * 0.75 - w / 2, top, w, h, showB, "B");

  // 관중석
  drawPlayers("A", 0, height - 110);
  drawPlayers("B", width / 2, height - 110);
}

// 세로 게이지 (팀 통에 물이 차오르듯)
function drawTank(x, y, w, h, amount, team) {
  noStroke();
  fill(60);
  rect(x, y, w, h, 12);
  fill(teamColor(team));
  rect(x, y + h * (1 - amount), w, h * amount, 12);
  fill(255);
  textSize(48);
  text(round(amount * 100) + "%", x + w / 2, y + h / 2);
  textSize(24);
  text(team + "팀 · " + teamPlayers(team).length + "명", x + w / 2, y - 22);
}

// ---------- 관중석: 한 사람씩 (내가 어디 있는지 찾기) ----------
// 축구: 각자의 기울기 화살표 / 흔들기·연타: 각자 한 만큼 막대
function drawPlayers(team, left, y) {
  let players = teamPlayers(team);
  let gap = width / 2 / (players.length + 1);
  for (let i = 0; i < players.length; i++) {
    let p = players[i];
    let x = left + gap * (i + 1);
    if (game.mode === "soccer") {
      drawArrow(x, y, p.tx * 30, p.ty * 30, color(255), 3);
    } else {
      let barH = min(p.count / targetFor(game.mode), 1) * 50;
      noStroke();
      fill(255);
      rect(x - 4, y - 15 - barH, 8, barH);
    }
    noStroke();
    fill(teamColor(team));
    circle(x, y, 22);
    fill(255);
    textSize(14);
    text(p.name, x, y + 35);
  }
}

// 무대 키보드: N = 다음 게임 / R = 처음(대기실)으로
function keyPressed() {
  if (isStage === false || game.phase === "lobby") return;
  if (key === "n" || key === "N") {
    startGame(nextMode(game.mode));
  }
  if (key === "r" || key === "R") {
    goLobby();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
