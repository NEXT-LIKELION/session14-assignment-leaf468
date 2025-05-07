const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const usersCollection = db.collection("users");

/**
 * 요구사항 구현:
 * 1. 유저들이 가입을 할 때 이름에 환영이 있으면 안됨
 * 2. 유저들이 가입을 할 때 이메일 형식이 다르면 안됨 (@없으면 저장 금지)
 * 3. 유저 이름으로 조회를 하고 싶어요
 * 4. 이메일 수정할 때도 @가 없으면 수정되지 않아요
 * 5. 가입 후 1분이 안 지난 데이터는 삭제할 수 없어요
 */

// 이메일 유효성 검사 함수 (요구사항 2)
function isValidEmail(email) {
    return email && email.includes("@");
}

// 이름 유효성 검사 함수 (요구사항 1)
function isValidName(name) {
    // "환영" 단어가 포함되어 있는지 확인
    return name && !name.includes("환영");
}

// POST: 유저 추가 (요구사항 1, 2)
exports.createUser = onRequest(async (req, res) => {
    if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
    }

    const { name, email } = req.body;

    // 필수 필드 확인
    if (!name || !email) {
        return res
            .status(400)
            .send({ error: "이름과 이메일을 모두 입력해주세요." });
    }

    // 이름 유효성 검사 (요구사항 1)
    if (!isValidName(name)) {
        return res
            .status(400)
            .send({ error: "이름에 '환영'이라는 단어가 포함될 수 없습니다." });
    }

    // 이메일 유효성 검사 (요구사항 2)
    if (!isValidEmail(email)) {
        return res.status(400).send({
            error: "유효한 이메일 형식이 아닙니다. '@'가 포함되어야 합니다.",
        });
    }

    try {
        // 현재 시간 저장 (요구사항 5)
        const createdAt = admin.firestore.FieldValue.serverTimestamp();

        // 사용자 데이터 저장
        const newUserRef = await usersCollection.add({
            name,
            email,
            createdAt,
        });

        res.status(201).send({
            id: newUserRef.id,
            message: `안녕하세요, ${name}님! 가입을 환영합니다.`,
        });
    } catch (error) {
        console.error(error);
        res.status(500).send({ error: error.message });
    }
});

// GET: 유저 조회 (요구사항 3)
exports.getUser = onRequest(async (req, res) => {
    if (req.method !== "GET") {
        return res.status(405).send("Method Not Allowed");
    }

    const userName = req.query.name;
    if (!userName) {
        return res
            .status(400)
            .send({ error: "조회할 사용자 이름이 필요합니다." });
    }

    try {
        const querySnapshot = await usersCollection
            .where("name", "==", userName)
            .get();

        if (querySnapshot.empty) {
            return res
                .status(404)
                .send({ error: "사용자를 찾을 수 없습니다." });
        }

        // 결과 데이터 포맷팅
        const users = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            // Firestore 타임스탬프 데이터 처리
            createdAt: doc.data().createdAt
                ? doc.data().createdAt.toDate()
                : null,
        }));

        res.status(200).send(users);
    } catch (error) {
        console.error(error);
        res.status(500).send({ error: error.message });
    }
});

// PUT: 유저 수정 (요구사항 4)
exports.updateUser = onRequest(async (req, res) => {
    if (req.method !== "PUT") {
        return res.status(405).send("Method Not Allowed");
    }

    const userName = req.query.name;
    const updateFields = req.body;

    if (!userName || !updateFields) {
        return res
            .status(400)
            .send({ error: "사용자 이름 또는 수정할 데이터가 없습니다." });
    }

    // 이메일 수정 요청이 있고, 이메일 형식이 유효하지 않은 경우 (요구사항 4)
    if (updateFields.email && !isValidEmail(updateFields.email)) {
        return res.status(400).send({
            error: "유효한 이메일 형식이 아닙니다. '@'가 포함되어야 합니다.",
        });
    }

    // 이름 수정 요청이 있고, 이름이 유효하지 않은 경우 (요구사항 1)
    if (updateFields.name && !isValidName(updateFields.name)) {
        return res
            .status(400)
            .send({ error: "이름에 '환영'이라는 단어가 포함될 수 없습니다." });
    }

    try {
        const querySnapshot = await usersCollection
            .where("name", "==", userName)
            .limit(1)
            .get();

        if (querySnapshot.empty) {
            return res
                .status(404)
                .send({ message: "사용자를 찾을 수 없습니다." });
        }

        const userDoc = querySnapshot.docs[0];
        await userDoc.ref.update(updateFields);

        res.status(200).send({
            message: "사용자 정보가 성공적으로 업데이트되었습니다.",
        });
    } catch (error) {
        console.error(error);
        res.status(500).send({ error: error.message });
    }
});

// DELETE: 유저 삭제 (요구사항 5)
exports.deleteUser = onRequest(async (req, res) => {
    if (req.method !== "DELETE") {
        return res.status(405).send("Method Not Allowed");
    }

    const userName = req.query.name;
    if (!userName) {
        return res
            .status(400)
            .send({ error: "삭제할 사용자 이름이 필요합니다." });
    }

    try {
        const querySnapshot = await usersCollection
            .where("name", "==", userName)
            .limit(1)
            .get();

        if (querySnapshot.empty) {
            return res
                .status(404)
                .send({ message: "사용자를 찾을 수 없습니다." });
        }

        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();

        // 가입 시간 확인 (요구사항 5)
        if (userData.createdAt) {
            const createdTime = userData.createdAt.toDate();
            const currentTime = new Date();
            const elapsedTimeInMs = currentTime - createdTime;

            // 1분(60,000ms)이 지났는지 확인
            if (elapsedTimeInMs < 60000) {
                return res.status(403).send({
                    error: "가입 후 1분이 지나지 않은 데이터는 삭제할 수 없습니다.",
                    remainingTime: `${Math.ceil(
                        (60000 - elapsedTimeInMs) / 1000
                    )}초 후에 삭제할 수 있습니다.`,
                });
            }
        }

        // 1분이 지났으면 삭제 진행
        await userDoc.ref.delete();

        res.status(200).send({
            message: "사용자가 성공적으로 삭제되었습니다.",
        });
    } catch (error) {
        console.error(error);
        res.status(500).send({ error: error.message });
    }
});
