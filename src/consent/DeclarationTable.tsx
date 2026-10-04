import { COOKIES } from '@/landing/copy';

import { DECLARATION } from './registry';

/** The cookie declaration as a table (web, DOM). Settings dialog + /privacy#cookies. */
export function DeclarationTable({ category }: { category?: string }) {
  const rows = DECLARATION.filter((i) => !category || i.category === category);
  const { cols } = COOKIES;
  return (
    <table className="cc-table">
      <thead>
        <tr>
          <th scope="col">{cols.name}</th>
          <th scope="col">{cols.provider}</th>
          <th scope="col">{cols.purpose}</th>
          <th scope="col">{cols.expiry}</th>
          <th scope="col">{cols.type}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((i) => (
          <tr key={i.type + i.name}>
            <td data-label={cols.name}>
              <code>{i.name}</code>
            </td>
            <td data-label={cols.provider}>{i.provider}</td>
            <td data-label={cols.purpose}>{i.purpose}</td>
            <td data-label={cols.expiry}>{i.expiry}</td>
            <td data-label={cols.type}>{i.type}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
