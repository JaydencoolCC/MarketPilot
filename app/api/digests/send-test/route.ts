import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/domain/errors";
import { getEmailSetting } from "@/lib/db/store";
import { getEmailProvider } from "@/lib/providers/email";

export async function POST() {
  try {
    const setting = await getEmailSetting();
    const digest = {
      title: "Trade Desk 邮件连接测试",
      generatedAt: new Date().toISOString(),
      sections: [
        {
          heading: "连接正常",
          body: "这是一封真实 SMTP 测试邮件。如果你收到它，说明发件配置和收件邮箱已经打通。",
        },
      ],
    };
    const result = await (await getEmailProvider()).sendDigest({ setting, digest, test: true });
    return NextResponse.json({ data: result, digest });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
