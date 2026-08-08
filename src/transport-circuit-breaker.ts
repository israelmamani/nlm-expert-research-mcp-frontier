export class TransportCircuitBreaker {
  private stalls:number[]=[];
  constructor(private readonly threshold=3,private readonly windowMs=10*60_000,private readonly now:()=>number=()=>Date.now()){}
  recordStall(){const cutoff=this.now()-this.windowMs;this.stalls=this.stalls.filter(at=>at>=cutoff);this.stalls.push(this.now());}
  recordHealthy(){this.stalls=[];}
  get degraded(){const cutoff=this.now()-this.windowMs;this.stalls=this.stalls.filter(at=>at>=cutoff);return this.stalls.length>=this.threshold;}
  get count(){return this.stalls.length;}
}
