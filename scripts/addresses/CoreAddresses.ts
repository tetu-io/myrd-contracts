export class CoreAddresses {
  public readonly tokenFactory: string;
  public readonly controller: string;
  public readonly gauge: string;
  public readonly xmyrd: string;

  constructor(
    tokenFactory: string,
    controller: string,
    gauge: string,
    xmyrd: string
  ) {
    this.tokenFactory = tokenFactory;
    this.controller = controller;
    this.gauge = gauge;
    this.xmyrd = xmyrd;

  }
}