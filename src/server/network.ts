import os from 'node:os';

export interface LanAddress {
  address: string;
  iface: string;
  /** VirtualBox / VMware / WSL / Docker… adapters: other computers cannot reach them. */
  virtual: boolean;
}

const VIRTUAL_NAME =
  /virtualbox|vbox|vmware|vmnet|vethernet|hyper-v|wsl|docker|podman|virbr|zerotier|tailscale|loopback|^(br-|veth|tun|tap|utun|awdl|llw|bridge|lo)\d*/i;

function isVirtual(iface: string, address: string) {
  return (
    VIRTUAL_NAME.test(iface) ||
    address.startsWith('192.168.56.') || // VirtualBox host-only default
    address.startsWith('169.254.') || // no DHCP (link-local)
    address.startsWith('172.17.') // Docker default bridge
  );
}

function preference(iface: string) {
  if (/wi-?fi|wlan|wireless|sem fios|wlp|^en0$/i.test(iface)) return 2;
  if (/\bethernet|^eth|^enp|^eno|^en\d/i.test(iface)) return 1;
  return 0;
}

/** IPv4 addresses of this machine, the ones colleagues can most likely reach first. */
export function lanAddresses(interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces()): LanAddress[] {
  const out: LanAddress[] = [];
  for (const [iface, list] of Object.entries(interfaces)) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      out.push({ address: a.address, iface, virtual: isVirtual(iface, a.address) });
    }
  }
  return out.sort((x, y) => Number(x.virtual) - Number(y.virtual) || preference(y.iface) - preference(x.iface));
}
