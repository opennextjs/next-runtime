import Link from 'next/link'
import { GithubIcon } from './icons'

// Show test suites and non-passing cases per each
export default function Table({ suites }) {
  const countColumns = ['Pass', 'Fail', 'Known', 'Skip']

  return (
    <table className="table issues-table text-base w-full">
      <thead>
        <tr>
          <th className="p-2 md:p-4">Test suite name</th>
          {countColumns.map((col) => {
            return (
              <th className="md:w-16 p-0 md:p-2 text-center" key={col}>
                {col}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {suites.map((suite, idx) => {
          return <TestSuiteRow suite={suite} key={'r' + idx} idx={idx} />
        })}
      </tbody>
    </table>
  )
}

function TestSuiteRow({ suite, idx }) {
  const badgeClasses = 'badge font-bold rounded '
  return (
    <>
      <tr key={'tr-' + idx} className="text-sm md:text-base">
        <td className="p-2 md:p-4">
          <Link href={suite.file} className="text-sm md:text-base">
            {suite.name}
          </Link>
        </td>
        <td>{suite.passed}</td>
        <td>
          {suite.failedUnknown > 0 ? (
            <div className={badgeClasses + 'badge-error text-white'}>{suite.failedUnknown}</div>
          ) : (
            '0'
          )}
        </td>
        <td>
          {suite.failedKnown > 0 ? (
            <div className={badgeClasses + 'badge-warning'}>{suite.failedKnown}</div>
          ) : (
            '0'
          )}
        </td>
        <td>
          {suite.skipped > 0 ? (
            <div className={badgeClasses + 'badge-accent'}>{suite.skipped}</div>
          ) : (
            '0'
          )}
        </td>
      </tr>

      {suite.testCases
        .filter((t) => t.status != 'passed')
        .map((t) => {
          return <IssueRow key={suite.name + t.name} test={t} />
        })}
    </>
  )
}

function IssueRow({ test }) {
  function shorten(text) {
    return text?.length > 100 ? text.slice(0, 45) + '[.....]' + text.slice(-45) : text
  }

  return (
    <tr>
      <td colSpan={5} className="border bg-base-200/[.4] md:pl-6">
        <div key={test.name} className="flex flex-col gap-1 text-neutral text-left">
          <div className="flex gap-2 items-center py-1">
            {test.status == 'failed' ? (
              !!test.reason ? (
                <div className="badge badge-warning rounded">Failed</div>
              ) : (
                <div className="badge badge-error rounded text-white">Failed</div>
              )
            ) : (
              <div className="badge badge-accent rounded">Skipped</div>
            )}
            <span className="opacity-90 text-sm md:text-base">
              <span className="font-bold">Test:</span> {shorten(test.name)}
            </span>
          </div>
          {!!test.reason && (
            <div className="flex justify-start text-neutral font-bold opacity-90">
              {test.link ? (
                <Link
                  href={test.link}
                  target="_blank"
                  className="flex gap-1 items-center text-sm md:text-base"
                >
                  <GithubIcon className="w-4" />
                  <span>{shorten(test.reason)}</span>
                </Link>
              ) : (
                <span>{shorten(test.reason)}</span>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}
