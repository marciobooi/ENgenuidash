import { CircleAlert, CircleCheck, Factory, Info, Leaf, LoaderCircle, PlugZap, TriangleAlert, Zap } from 'lucide-react'
import { AreaChart, BarChart, LineChart, PieChart } from './components/charts'
import { KpiCard, KpiGrid } from './components/kpi'
import { notify } from './components/toast'
import type { Strings } from './i18n'
import './ComponentsGallery.css'

// Illustrative sample values for previewing the components — not official statistics.
const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023]
export default function ComponentsGallery({ locale, t }: { locale: string; t: Strings }) {
  const SAMPLE = t.sampleData
  const labels = {
    showTable: t.showTable,
    hideTable: t.hideTable,
    downloadPng: t.downloadPng,
    downloadCsv: t.downloadCsv,
    loading: t.chartLoading,
    loadError: t.chartLoadError,
    retry: t.retry,
    skipChart: t.skipChart,
    chartEnd: t.chartEnd,
  }

  const demos = [
    {
      label: t.demoSuccess,
      icon: CircleCheck,
      run: () => notify.success(t.toastSuccessTitle, { description: t.toastSuccessDesc }),
    },
    { label: t.demoInfo, icon: Info, run: () => notify.info(t.toastInfoTitle, { description: t.toastInfoDesc }) },
    {
      label: t.demoWarning,
      icon: TriangleAlert,
      run: () => notify.warning(t.toastWarningTitle, { description: t.toastWarningDesc }),
    },
    {
      label: t.demoError,
      icon: CircleAlert,
      run: () =>
        notify.error(t.toastErrorTitle, {
          description: t.toastErrorDesc,
          action: { label: t.retry, onClick: () => notify.info(t.toastInfoTitle) },
        }),
    },
    {
      label: t.demoLoading,
      icon: LoaderCircle,
      run: () => {
        const id = notify.loading(t.toastLoadingTitle)
        window.setTimeout(() => notify.success(t.toastLoadingDone, { id }), 1800)
      },
    },
  ]

  return (
    <main className="gallery" id="main" tabIndex={-1}>
      <h2 className="gallery__title">{t.components}</h2>

      <section className="gallery__section" aria-labelledby="demo-toasts">
        <h3 className="gallery__subtitle" id="demo-toasts">
          {t.notificationsDemo}
        </h3>
        <div className="gallery__buttons">
          {demos.map(({ label, icon: Icon, run }) => (
            <button key={label} type="button" className="gallery__btn" onClick={run}>
              <Icon size={16} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <KpiGrid label={t.keyIndicators}>
        <KpiCard label="Renewables share" value={24.5} unit="%" delta={1.4} deltaUnit="pp" deltaLabel="vs 2022" icon={Leaf} locale={locale} />
        <KpiCard label="Energy imports dependency" value={62.5} unit="%" delta={-0.9} deltaUnit="pp" deltaLabel="vs 2022" goodDirection="down" icon={Factory} locale={locale} />
        <KpiCard label="Final energy consumption" value={893} unit="Mtoe" delta={2.1} deltaLabel="vs 2022" goodDirection="down" decimals={0} icon={Zap} locale={locale} />
        <KpiCard label="Electricity price" value={0.29} unit="€/kWh" delta={0} deltaLabel="vs 2022" goodDirection="neutral" decimals={2} icon={PlugZap} caption="Households" locale={locale} />
      </KpiGrid>

      <div className="gallery__grid">
        <LineChart
          title="Share of renewables in energy consumption"
          subtitle="% of gross final energy consumption"
          description="Line chart of the renewable share for three example countries, 2016 to 2023. All three rise steadily."
          source={SAMPLE}
          labels={labels}
          lang={locale}
          categories={YEARS}
          series={[
            { name: 'Country A', data: [17.0, 17.5, 18.0, 19.9, 22.0, 21.9, 23.0, 24.5] },
            { name: 'Country B', data: [14.9, 15.5, 16.4, 17.3, 19.1, 19.4, 20.8, 21.6] },
            { name: 'Country C', data: [32.0, 33.1, 34.4, 35.8, 37.2, 38.1, 40.2, 42.0] },
          ]}
          valueSuffix="%"
        />

        <BarChart
          title="Electricity generation by source"
          subtitle="TWh, 2023"
          description="Horizontal bar chart ranking electricity sources by generation."
          source={SAMPLE}
          labels={labels}
          lang={locale}
          orientation="horizontal"
          categories={['Nuclear', 'Wind', 'Natural gas', 'Hydro', 'Solar', 'Coal']}
          series={[{ name: 'Generation', data: [619, 477, 452, 336, 252, 333] }]}
          valueSuffix=" TWh"
          decimals={0}
          showValues
        />

        <AreaChart
          title="Gross electricity production mix"
          subtitle="% of total, stacked"
          description="Stacked percentage area chart of the electricity mix; renewables grow while fossil fuels shrink."
          source={SAMPLE}
          labels={labels}
          lang={locale}
          categories={YEARS}
          stacked="percent"
          series={[
            { name: 'Renewables', data: [30, 31, 32, 34, 38, 37, 39, 44] },
            { name: 'Nuclear', data: [26, 26, 25, 26, 25, 25, 22, 23] },
            { name: 'Fossil fuels', data: [44, 43, 43, 40, 37, 38, 39, 33] },
          ]}
        />

        <PieChart
          title="Final energy consumption by sector"
          subtitle="% of total, 2023"
          description="Donut chart: transport and households are the largest consuming sectors."
          source={SAMPLE}
          labels={labels}
          lang={locale}
          seriesName="Share"
          donut
          centerLabel="EU"
          data={[
            { name: 'Transport', y: 31 },
            { name: 'Households', y: 27 },
            { name: 'Industry', y: 25 },
            { name: 'Services', y: 14 },
            { name: 'Agriculture', y: 3 },
          ]}
          valueSuffix="%"
          decimals={0}
        />

        <BarChart
          title="Energy consumption by year and fuel"
          subtitle="Mtoe"
          description="Grouped column chart comparing two fuels over four years."
          source={SAMPLE}
          labels={labels}
          lang={locale}
          categories={['2020', '2021', '2022', '2023']}
          series={[
            { name: 'Oil', data: [310, 330, 335, 328] },
            { name: 'Gas', data: [215, 225, 198, 186] },
          ]}
          valueSuffix=" Mtoe"
          decimals={0}
        />
      </div>
    </main>
  )
}
