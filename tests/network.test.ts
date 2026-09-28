import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { lanAddresses } from '../src/server/network';

const v4 = (address: string, internal = false) => ({ address, family: 'IPv4', internal }) as NetworkInterfaceInfo;

describe('lanAddresses', () => {
  it('puts the real Wi-Fi/Ethernet address first and flags virtual adapters', () => {
    const list = lanAddresses({
      'VirtualBox Host-Only Network': [v4('192.168.56.1')],
      'vEthernet (WSL)': [v4('172.28.16.1')],
      'Loopback Pseudo-Interface 1': [v4('127.0.0.1', true)],
      Ethernet: [v4('10.0.0.5'), { address: 'fe80::1', family: 'IPv6', internal: false } as NetworkInterfaceInfo],
      'Wi-Fi': [v4('192.168.131.176')],
    });
    expect(list.map((a) => [a.address, a.virtual])).toEqual([
      ['192.168.131.176', false],
      ['10.0.0.5', false],
      ['192.168.56.1', true],
      ['172.28.16.1', true],
    ]);
  });

  it('recognises Linux/macOS virtual interfaces too', () => {
    const list = lanAddresses({ docker0: [v4('172.17.0.1')], 'br-1a2b': [v4('172.18.0.1')], wlp2s0: [v4('192.168.1.20')] });
    expect(list.filter((a) => !a.virtual).map((a) => a.address)).toEqual(['192.168.1.20']);
  });
});
