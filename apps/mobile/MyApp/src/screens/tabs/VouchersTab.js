/**
 * VouchersTab — keeps vouchers inside the tab navigator so back navigation
 * from a pushed voucher form is not immediately redirected by a focus hook.
 */
import VoucherEntry from '../vouchers/VoucherEntry';

export default function VouchersTab() {
  return <VoucherEntry />;
}
