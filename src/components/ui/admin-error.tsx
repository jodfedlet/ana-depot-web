"use client";

import { ShieldAlert } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import { apiErrorKey, fieldErrorKey, fieldProblems, isForbidden, isSessionProblem, isVersionConflict, problemOf } from "@/lib/api/errors";
import { ApiErrorState } from "./api-error";
import { EmptyState } from "./states";

/**
 * A failed STAFF call, as a whole-page state. 401 and 403 are different: an expired session asks to sign in again; a signed-in person the API does not
 * accept as staff gets "access denied" and no data (fail closed). Anything else is a translated message with a retry.
 */
export function AdminErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  if (isSessionProblem(error)) {
    return (
      <EmptyState icon={<ShieldAlert aria-hidden />} title={t("adminCommon.sessionExpiredTitle")}>
        <ButtonLink href={`/auth/login?status=expired&next=${encodeURIComponent("/admin")}`}>{t("adminCommon.signInAgain")}</ButtonLink>
      </EmptyState>
    );
  }
  if (isForbidden(error)) {
    return (
      <EmptyState icon={<ShieldAlert aria-hidden />} title={t("adminCommon.forbiddenTitle")} description={t("adminCommon.forbiddenText")}>
        <ButtonLink href="/" variant="outline">{t("admin.guard.backToStore")}</ButtonLink>
      </EmptyState>
    );
  }
  return <ApiErrorState error={error} onRetry={onRetry} />;
}

/**
 * The error of a failed WRITE, inline above the form (so what the person typed stays on screen). A version conflict offers to reload the record;
 * validation problems list each field's message.
 */
export function ActionError({ error, onReload, fieldLabel }: { error: unknown; onReload?: () => void; fieldLabel?: (field: string) => string }) {
  const t = useT();
  if (error == null) return null;
  if (isSessionProblem(error)) {
    return <Alert tone="warning" live="assertive" title={t("adminCommon.sessionExpiredTitle")}><Link href={`/auth/login?status=expired&next=${encodeURIComponent("/admin")}`} className="font-semibold underline underline-offset-2">{t("adminCommon.signInAgain")}</Link> · {t("adminCommon.unsavedKept")}</Alert>;
  }
  if (isForbidden(error)) return <Alert tone="danger" live="assertive" title={t("adminCommon.forbiddenTitle")}>{t("adminCommon.forbiddenText")}</Alert>;
  if (isVersionConflict(error)) {
    return (
      <Alert tone="warning" live="assertive" title={t("adminCommon.conflictTitle")}>
        {t("adminCommon.conflictText")}
        {onReload && <Button size="sm" variant="outline" className="mt-3" onClick={onReload}>{t("adminCommon.reload")}</Button>}
      </Alert>
    );
  }
  const fields = Object.entries(fieldProblems(error));
  const code = problemOf(error)?.code;
  return (
    <Alert tone="danger" live="assertive">
      <p>{t(apiErrorKey(error))}</p>
      {fields.length > 0 && code !== "concurrent_update" && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5">
          {fields.slice(0, 12).map(([field, c]) => <li key={field}><span className="font-medium">{fieldLabel ? fieldLabel(field) : field}</span> — {t(fieldErrorKey(c))}</li>)}
        </ul>
      )}
    </Alert>
  );
}
