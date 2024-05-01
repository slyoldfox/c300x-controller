const net = require('net');
const config = require('../../config.js')
const udpProxy = require('../udp-proxy.js')

class BtAvMedia {

  #client
  #videoProxies = []
  #audioProxies = []

  #addStream(seq) {
    let client = this.#client
    //console.log("socket: " + client)
    if (client)
      console.log("socket destroyed? " + client.destroyed)
    if (client && !client.destroyed) {
      console.log("\t\tS (reused) -> " + seq)
      client.write(seq)
    } else {
      client = new net.Socket()
      this.#client = client
      let avMedia = this
      client.numberOfRetries = 0;
      client.setTimeout(5000, () => { console.log('\t\tS> [idle timeout reached, disconnecting]'); client.end(); client.destroy() });
      client.on('error', function (err) {
        console.error(err); client.destroy()
        setTimeout(() => {
          $client.numberOfRetries++
          console.log("\t\tS (retry after error) -> " + seq)
          avMedia.#addStream(seq)
        }, 1000)
      })
      client.once('connect', () => {
        console.log('\t\tS> [connected]')
        console.log("\t\tS -> " + seq)
        client.write(seq)
      })
      client.on('data', (data) => { this.#data(client, avMedia, seq, data) })
      client.on('close', () => { console.log('\t\tS> [closed]') })
      console.log("\tAV > Preparing stream... connecting")
      client.connect(30007, '127.0.0.1')
    }
  }

  addVideoStream(ip) {
    if( config.global.useUdpProxies ) {
      if( config.global.highResVideo ) {
        // 688x480
        this.#videoProxies.push( udpProxy.create( 5007, '127.0.0.1', 5002, ip ))
      } else {
        // 400x288
        this.#videoProxies.push( udpProxy.create( 5002, '127.0.0.1', 5002, ip ))
      }
    } else {    
      if( config.global.highResVideo ) {
        this.#addStream('*7*300#' + this.#ipInHashForm(ip) + '#5002#0*##')
      } else {
        this.#addStream('*7*300#' + this.#ipInHashForm(ip) + '#5002#1*##')
      }
    }
  }

  addAudioStream(ip) {
    if( config.global.useUdpProxies ) {
      this.#audioProxies.push( udpProxy.create( 5000, '127.0.0.1', 5000, ip ))
    } else {
      this.#addStream('*7*300#' + this.#ipInHashForm(ip) + '#5000#2*##')
    }
  }

  #ipInHashForm(ip) {
    return ip.toString().replaceAll(/\./g, '#')
  }

  cleanup() {
    if( config.global.useUdpProxies ) {
      console.log("Cleaning up udp proxies")
      console.log("video proxies: " + this.#videoProxies.length)
      console.log("audio proxies: " + this.#audioProxies.length)
      while (this.#videoProxies.length > 0) {
        let proxy = this.#videoProxies.pop()
        proxy.destroy()
      }
      while (this.#audioProxies.length > 0) {
        let proxy = this.#audioProxies.pop()
        proxy.destroy()
      }  
    }
  }

  #data($client, $avMedia, seq, data) {
    console.log('\t\tS <- ' + data + ':')
    if (data == '*#*0##') {
      console.log("\t\tS RETRYING...")
      if ($client.numberOfRetries >= 3) { console.log("Destroying, numberOfRetries >= 3"); $client.destroy() }
      setTimeout(() => {
        $client.numberOfRetries++
        console.log("\t\tS (retry after *#0*0## -> " + seq)
        $avMedia.addStream(seq)
        //$client.write(seq)
      }, 1000)
    } else if (data == '*#*1##') {
      //$client.destroy()
    } else {
      console.log('\t\tS> UNSUPPORTED REPLY ABORTING' + data)
      $client.destroy()
    }
  }
}

module.exports = {
  create() {
    return new BtAvMedia()
  }
}
