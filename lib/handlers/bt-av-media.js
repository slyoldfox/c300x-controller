const net = require('net');
const config = require('../../config')
const utils = require('../utils')
const debug = utils.getDebugger('bt-av-media')

class BtAvMedia {

  #client

  #addStream(seq) {
    let client = this.#client
    /*
    if (client)
      debug("socket destroyed? %s", client.destroyed)
    */
    if (client && !client.destroyed) {
      debug("\t\tS (reused) -> %s", seq)
      client.write(seq)
    } else {
      client = new net.Socket()
      this.#client = client
      let avMedia = this
      client.numberOfRetries = 0;
      client.setTimeout(5000, () => { debug('\t\tS> [idle timeout reached, disconnecting]'); client.end(); client.destroy() });
      client.on('error', function (err) {
        debug(err); client.destroy()
        setTimeout(() => {
          client.numberOfRetries++
          debug("\t\tS (retry after error) -> %s", seq)
          avMedia.#addStream(seq)
        }, 1000)
      })
      client.once('connect', () => {
        debug('\t\tS> [connected]')
        debug("\t\tS -> %s", seq)
        client.write(seq)
      })
      client.on('data', (data) => { this.#data(client, avMedia, seq, data) })
      client.on('close', () => { debug('\t\tS> [closed]') })
      debug("\tAV > Preparing stream... connecting")
      client.connect(30007, '127.0.0.1')
    }
  }

  addVideoStream(ip, videoPort) {
    console.log(`ADDING VIDEO STREAM ON IP ${ip} / PORT ${videoPort} `)
    if( config.global.highResVideo ) {
      this.#addStream('*7*300#' + this.#ipInHashForm(ip) + '#' + videoPort + '#0*##')
    } else {
      this.#addStream('*7*300#' + this.#ipInHashForm(ip) + '#' + videoPort + '#1*##')
    }
  }

  addAudioStream(ip, audioPort) {
    console.log(`ADDING AUDIO STREAM ON IP ${ip} / PORT ${audioPort}`)
    this.#addStream('*7*300#' + this.#ipInHashForm(ip) + '#' + audioPort + '#2*##')
  }

  #ipInHashForm(ip) {
    return ip.toString().replaceAll(/\./g, '#')
  }

  cleanup() {
  }

  #data($client, $avMedia, seq, data) {
    debug('\t\tS <- :%s:', data)
    if (data == '*#*0##') {
      debug("\t\tS RETRYING...")
      if ($client.numberOfRetries >= 3) { debug("Destroying, numberOfRetries >= 3"); $client.destroy() }
      else {
        setTimeout(() => {
          $client.numberOfRetries++
          debug("\t\tS (retry after *#0*0## -> %s", seq)
          $avMedia.#addStream(seq)
          //$client.write(seq)
        }, 1000)
      }
    } else if (data == '*#*1##' || data == '*#*1##*#*1##') { //should probably fix this *#*1##*#*1## reply sometime with concurrent setups
      //$client.destroy()
    } else {
      debug('\t\tS> UNSUPPORTED REPLY ABORTING %s', data)
      $client.destroy()
    }
  }
}

module.exports = {
  create() {
    return new BtAvMedia()
  }
}
