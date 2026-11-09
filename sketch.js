// 기울기 축구 (p5.party + 핸드폰 센서)
// 핸드폰을 기울여서, 우리 팀 모두의 힘으로 공을 상대 골대에 넣는 게임
//
// 무대(프로젝터): 주소 끝에 ?stage=1 을 붙여서 연다 → 공 계산 + 경기장 보여주기 (교수자 1명만!)
// 컨트롤러(핸드폰): 그냥 주소로 연다 → 이름 쓰고 팀 고르기 → 핸드폰 기울이기
//
// A팀(주황)은 오른쪽 골대에, B팀(파랑)은 왼쪽 골대에 넣으면 득점

let room = "class"; // ✏️ 방 이름

let isStage = false; // 무대인지 컨트롤러인지
let game; // 모두가 함께 보는 데이터 (점수, 메시지): 무대만 바꿈
let me; // 내 데이터 (팀, 이름, 기울기): 나만 바꿈
let guests; // 접속한 모든 사람의 데이터

// 컨트롤러(핸드폰)용
let nameInput, btnA, btnB, btnReset;
let baseX = 0; // 기준 자세: 처음 들고 있던 기울기를 0으로 삼기
let baseY = 0;
let calibrated = false;

// 무대용: 공 위치와 속도 (경기장 크기에 대한 0~1 비율)
let bx = 0.5;
let by = 0.5;
let vx = 0;
let vy = 0;
let goalTop = 0.35; // 골대 입구 범위 (위~아래)
let goalBottom = 0.65;
let goalTime = 0;

async function setup() {
  createCanvas(windowWidth, windowHeight);
  angleMode(DEGREES); // 기울기를 '도' 단위로
  textAlign(CENTER, CENTER);
  isStage = getURLParams().stage === "1"; // 주소에 ?stage=1 이 있으면 무대

  // 서버 접속 + 공유 데이터 불러오기
  await partyConnect("wss://demoserver.p5party.org", "interactive2_soccer", room);
  game = await partyLoadShared("game", { scoreA: 0, scoreB: 0, msg: "" });
  me = await partyLoadMyShared({ stage: isStage, team: "", name: "", tx: 0, ty: 0 });
  guests = partyLoadGuestShareds();

  if (isStage === false) {
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

// ---------------------------------------------------------------
// 팀 전체의 힘 계산 (무대와 핸드폰이 함께 씀)
// x, y: 팀원 기울기의 평균 → 팀이 공을 미는 방향과 세기
// together: 한마음 지수 (0~1). 모두 같은 방향으로 기울이면 1에 가까워짐
// ---------------------------------------------------------------
function teamForce(team) {
  let sumX = 0;
  let sumY = 0;
  let sumLen = 0; // 각자 얼마나 세게 기울였는지의 합
  let n = 0;
  for (let g of guests) {
    if (g.team === team && g.stage !== true) {
      sumX += g.tx;
      sumY += g.ty;
      sumLen += mag(g.tx, g.ty);
      n++;
    }
  }
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
  btnReset.show();
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

  // 1. 내 기울기 → -1 ~ 1 (30도 기울이면 최대)
  let tx = constrain((rotationY - baseY) / 30, -1, 1); // 좌우로 기울이기
  let ty = constrain((rotationX - baseX) / 30, -1, 1); // 앞뒤로 기울이기

  // 2. 서버로 보내기: 25명이 매 프레임 보내면 서버가 힘드니 6프레임에 한 번만
  if (frameCount % 6 === 0) {
    me.tx = round(tx, 1);
    me.ty = round(ty, 1);
  }

  // 3. 그리기
  let c = teamColor(me.team);
  background(lerpColor(c, color(255), 0.75)); // 우리 팀 색 배경
  let team = teamForce(me.team);
  let r = min(width, height) * 0.28;

  // 우리 팀 화살표 (굵고 연하게) + 내 화살표 (검정)
  drawArrow(width / 2, height / 2, team.x * r, team.y * r, color(red(c), green(c), blue(c), 160), 20);
  drawArrow(width / 2, height / 2, tx * r, ty * r, color(0), 8);
  fill(0);
  noStroke();
  circle(width / 2, height / 2, 16);

  // 글자
  textSize(28);
  text(me.name + " · " + me.team + "팀", width / 2, 50);
  textSize(18);
  text("A " + game.scoreA + " : " + game.scoreB + " B", width / 2, 90);
  text("우리 팀 " + team.n + "명 · 한마음 " + round(team.together * 100) + "%", width / 2, height - 130);
  textSize(14);
  text("검은 화살표: 나 / 굵은 화살표: 우리 팀 전체", width / 2, height - 100);

  // 골 메시지
  if (game.msg !== "") {
    textSize(48);
    text(game.msg, width / 2, height * 0.25);
  }
}

// ===============================================================
// 무대 (프로젝터)
// ===============================================================
function drawStage() {
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
  // 골 메시지는 2초 뒤 지우기
  if (game.msg !== "" && millis() - goalTime > 2000) {
    game.msg = "";
  }

  // 2. 경기장 그리기
  let fy = 90; // 경기장 위치와 크기 (위: 점수, 아래: 관중석)
  let fh = height - fy - 140;
  background(25);
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
  text("A  " + game.scoreA, width / 2 - 100, 45);
  fill(teamColor("B"));
  text(game.scoreB + "  B", width / 2 + 100, 45);
  textSize(16);
  fill(teamColor("A"));
  text(A.n + "명 · 한마음 " + round(A.together * 100) + "% · 오른쪽으로 →", width / 4, 45);
  fill(teamColor("B"));
  text("← 왼쪽으로 · " + B.n + "명 · 한마음 " + round(B.together * 100) + "%", (width * 3) / 4, 45);

  // 관중석: 한 사람씩 + 각자의 기울기 화살표 (내가 어디 있는지 찾기)
  drawPlayers("A", 0, height - 120);
  drawPlayers("B", width / 2, height - 120);

  // 골 메시지
  if (game.msg !== "") {
    fill(255);
    textSize(80);
    text(game.msg, width / 2, fy + fh / 2);
  }
}

// 한 팀의 선수들을 가로로 늘어놓기
function drawPlayers(team, left, y) {
  let players = [];
  for (let g of guests) {
    if (g.team === team && g.stage !== true) {
      players.push(g);
    }
  }
  let gap = (width / 2) / (players.length + 1);
  for (let i = 0; i < players.length; i++) {
    let p = players[i];
    let x = left + gap * (i + 1);
    drawArrow(x, y, p.tx * 30, p.ty * 30, color(255), 3);
    noStroke();
    fill(teamColor(team));
    circle(x, y, 22);
    fill(255);
    textSize(14);
    text(p.name, x, y + 40);
  }
}

function goal(team) {
  if (team === "A") {
    game.scoreA = game.scoreA + 1;
  } else {
    game.scoreB = game.scoreB + 1;
  }
  game.msg = team + "팀 골!";
  goalTime = millis();
  bx = 0.5; // 공을 가운데로
  by = 0.5;
  vx = 0;
  vy = 0;
}

// 무대에서 R 키: 점수 초기화
function keyPressed() {
  if (isStage === true && (key === "r" || key === "R")) {
    game.scoreA = 0;
    game.scoreB = 0;
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
