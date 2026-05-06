import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

if (!admin.apps.length) {
  let serviceAccount: object;

  const localPath = path.join(process.cwd(), "service-account.json");
  if (fs.existsSync(localPath)) {
    // Local development: read from file
    serviceAccount = JSON.parse(fs.readFileSync(localPath, "utf-8"));
  } else {
    // Production (Vercel): read from env var
    serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT as string
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  });
}

export const adminDb = getFirestore();