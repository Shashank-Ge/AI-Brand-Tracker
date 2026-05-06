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
    // PowerShell's ConvertTo-Json can corrupt \n sequences in private_key —
    // we fix this by re-escaping any literal newlines before parsing.
    const raw = (process.env.FIREBASE_SERVICE_ACCOUNT as string)
      .replace(/\n/g, "\\n")   // re-escape literal newlines → \n
      .replace(/\r/g, "");     // strip carriage returns
    serviceAccount = JSON.parse(raw);
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  });
}

export const adminDb = getFirestore();