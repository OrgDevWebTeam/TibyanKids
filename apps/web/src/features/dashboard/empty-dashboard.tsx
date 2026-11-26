import { buttonClasses } from "@tibyan/ui";
import { Link } from "react-router";
import { PageTitle } from "@/components/page-title";
import { useI18n } from "@/i18n/locale-data";
import { ChartColumnIcon, HeartIcon, ShieldCheckIcon } from "./dashboard-icons";

const POINT_ICONS = [HeartIcon, ChartColumnIcon, ShieldCheckIcon];

/**
 * The dashboard before the family has a child (Figma "Parent Dashboard", States · Dashboard empty
 * (no child yet)): a 720px card in the middle with the heading, what the dashboard will show,
 * "Add child", and three lines about the product.
 */
export function EmptyDashboard() {
  const { dict, locale } = useI18n();
  const t = dict.dashboard.empty;

  return (
    <div className="flex justify-center pt-8">
      <PageTitle title={dict.screens.dashboard} />
      {/* Card: card/radius, border/subtle, 32px padding, 12px between its parts, Elevation/1. */}
      <section
        aria-labelledby="empty-dashboard-title"
        className="flex w-full max-w-[720px] flex-col items-center gap-3 rounded-button border border-line bg-surface p-8 text-center shadow-[0_1px_3px_color-mix(in_srgb,var(--tibyan-shadow)_10%,transparent)]"
      >
        {/* H2 (32/40, 32/48 in Arabic) over Body, which keeps the page's line height. */}
        <div className="flex flex-col gap-1">
          <h1
            id="empty-dashboard-title"
            className="text-[2rem] leading-10 font-bold text-ink rtl:leading-12"
          >
            {t.title}
          </h1>
          <p className="font-medium text-ink-muted">{t.body}</p>
        </div>
        <Link to={`/${locale}/dashboard/add-child`} className={buttonClasses("primary")}>
          {dict.dashboard.addChild}
        </Link>
        {/* Body Small (14/22, 14/24 in Arabic) with a 20px brand icon. */}
        <ul className="flex w-full flex-col gap-3 text-start">
          {t.points.map((point, index) => {
            const Icon = POINT_ICONS[index] ?? HeartIcon;
            return (
              <li
                key={point}
                className="flex items-center gap-2 text-sm leading-[22px] font-medium rtl:leading-6"
              >
                <Icon className="size-5 shrink-0 text-primary" />
                {point}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
