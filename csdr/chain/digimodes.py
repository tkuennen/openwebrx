from csdr.chain.demodulator import ServiceDemodulator, SecondaryDemodulator, DialFrequencyReceiver, SecondarySelectorChain
from owrx.audio.chopper import AudioChopper, AudioChopperParser
from owrx.aprs.kiss import KissDeframer
from owrx.aprs import Ax25Parser, AprsParser
from pycsdr.modules import Convert, FmDemod, Agc, TimingRecovery, DBPskDecoder, VaricodeDecoder, CwDecoder, RttyDecoder
from pycsdr.types import Format
from owrx.aprs.module import DirewolfModule
from digiham.modules import FskDemodulator, PocsagDecoder
from owrx.pocsag import PocsagParser


class AudioChopperDemodulator(ServiceDemodulator, DialFrequencyReceiver):
    def __init__(self, mode: str, parser: AudioChopperParser):
        self.chopper = AudioChopper(mode, parser)
        workers = [Convert(Format.FLOAT, Format.SHORT), self.chopper]
        super().__init__(workers)

    def getFixedAudioRate(self):
        return 12000

    def setDialFrequency(self, frequency: int) -> None:
        self.chopper.setDialFrequency(frequency)


class PacketDemodulator(ServiceDemodulator, DialFrequencyReceiver):
    def __init__(self, service: bool = False):
        self.parser = AprsParser()
        workers = [
            FmDemod(),
            Convert(Format.FLOAT, Format.SHORT),
            DirewolfModule(service=service),
            KissDeframer(),
            Ax25Parser(),
            self.parser,
        ]
        super().__init__(workers)

    def supportsSquelch(self) -> bool:
        return False

    def getFixedAudioRate(self) -> int:
        return 48000

    def setDialFrequency(self, frequency: int) -> None:
        self.parser.setDialFrequency(frequency)


class PocsagDemodulator(ServiceDemodulator, DialFrequencyReceiver):
    def __init__(self):
        self.parser = PocsagParser()
        workers = [
            FmDemod(),
            FskDemodulator(samplesPerSymbol=40, invert=True),
            PocsagDecoder(),
            self.parser,
        ]
        super().__init__(workers)

    def supportsSquelch(self) -> bool:
        return False

    def getFixedAudioRate(self) -> int:
        return 48000

    def setDialFrequency(self, frequency: int) -> None:
        self.parser.setDialFrequency(frequency)


class PskDemodulator(SecondaryDemodulator, SecondarySelectorChain):
    def __init__(self, baudRate: float):
        self.baudRate = baudRate
        # this is an assumption, we will adjust in setSampleRate
        self.sampleRate = 12000
        secondary_samples_per_bits = int(round(self.sampleRate / self.baudRate)) & ~3
        workers = [
            Agc(Format.COMPLEX_FLOAT),
            TimingRecovery(secondary_samples_per_bits, 0.5, 2, useQ=True),
            DBPskDecoder(),
            VaricodeDecoder(),
        ]
        super().__init__(workers)

    def getBandwidth(self):
        return self.baudRate

    def setSampleRate(self, sampleRate: int) -> None:
        if sampleRate == self.sampleRate:
            return
        self.sampleRate = sampleRate
        secondary_samples_per_bits = int(round(self.sampleRate / self.baudRate)) & ~3
        self.replace(1, TimingRecovery(secondary_samples_per_bits, 0.5, 2, useQ=True))


class CwDemodulator(SecondaryDemodulator, SecondarySelectorChain):
    def __init__(self, baudRate: float):
        self.baudRate = baudRate
        self.sampleRate = 12000
        workers = [
            Agc(Format.COMPLEX_FLOAT),
            CwDecoder(self.sampleRate, 0, int(self.baudRate)),
        ]
        super().__init__(workers)

    def getBandwidth(self):
        return self.baudRate

    def setSampleRate(self, sampleRate: int) -> None:
        if sampleRate == self.sampleRate:
            return
        self.sampleRate = sampleRate
        self.replace(1, CwDecoder(sampleRate, 0, int(self.baudRate)))


class RttyDemodulator(SecondaryDemodulator, SecondarySelectorChain):
    def __init__(self, baudRate: float):
        # Our input "baud rate" is actually frequency shift here
        # Real RTTY baud rate is different
        self.sampleRate = 12000
        self.targetWidth = baudRate
        self.baudRate = 45.45
        workers = [
            Agc(Format.FLOAT),
            RttyDecoder(self.sampleRate, 0, int(self.targetWidth), self.baudRate),
        ]
        super().__init__(workers)

    def getBandwidth(self):
        return self.targetWidth

    def setSampleRate(self, sampleRate: int) -> None:
        if sampleRate == self.sampleRate:
            return
        self.sampleRate = sampleRate
        self.replace(1, RttyDecoder(sampleRate, 0, int(self.targetWidth), self.baudRate))

