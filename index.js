const net = require('net');
const fs = require('fs');

// XMODEM protocol constants
const SOH = 0x01; // Start of Header
const EOT = 0x04; // End of Transmission
const ACK = 0x06; // Acknowledge
const NAK = 0x15; // Not Acknowledge
const CAN = 0x18; // Cancel
const INIT = 0x08; // Initialize Transmission

const PORT = 9001;
const PACKET_SIZE = 128;

//calculate checksum
function calculateChecksum(data) {
    let checksum = 0;
    for (let byte of data) {
        checksum = (checksum + byte) & 0xFF; // Add each byte and keep only the last 8 bits
    }
    return checksum; // Return the 8-bit checksum
}


// Packet creation function
function createPacket(packetNumber, data) {
    const packet = Buffer.alloc(3 + PACKET_SIZE + 2); // Two bytes for CRC
    packet[0] = SOH;                                 // Start of Header
    packet[1] = packetNumber;                        // Packet Number
    packet[2] = 255 - packetNumber;                  // 1's complement of packet number

    for (let i = 0; i < PACKET_SIZE; i++) {
        packet[3 + i] = i < data.length ? data[i] : 0x1A; // Pad with 0x1A
    }

    const crc = calculateChecksum(packet.slice(3, 3 + PACKET_SIZE));
    packet[3 + PACKET_SIZE] = crc & 0xFF;           // Low byte
    packet[3 + PACKET_SIZE + 1] = (crc >> 8) & 0xFF; // High byte

    return packet;
}

// Server setup
const server = net.createServer(socket => {
    console.log('Client connected');

    let binaryFilePath = process.argv[2];
    if (!binaryFilePath) {
        console.error('Please provide the binary file path as an argument.');
        process.exit(1);
    }

    const dataToSend = fs.readFileSync(binaryFilePath); // Read the binary file
    let packetNumber = 1;

    // Data divided into 128-byte packets
    const packets = [];
    for (let i = 0; i < dataToSend.length; i += PACKET_SIZE) {
        const packetData = dataToSend.slice(i, i + PACKET_SIZE);
        packets.push(createPacket(packetNumber++, packetData));
    }

    let currentPacket = 0;

    function sendNextPacket() {
        if (currentPacket < packets.length) {
            socket.write(packets[currentPacket]);
            console.log(`Sent packet #${currentPacket + 1}`);
            currentPacket++;
        } else {
            socket.write(Buffer.from([EOT])); // Send End of Transmission
            console.log('Sent EOT');
        }
    }

    socket.on('data', data => {
        if (data[0] === INIT) {
            console.log('Received INIT, starting transmission');
            sendNextPacket();
        } else if (data[0] === ACK) {
            console.log('Received ACK');
            sendNextPacket();
        } else if (data[0] === NAK) {
            console.log('Received NAK, resending current packet');
            socket.write(packets[currentPacket - 1]);
        } else if (data[0] === CAN) {
            console.log('Received CAN, cancelling transmission');
            socket.end();
        } else {
            console.log('Unexpected response, cancelling transmission');
            socket.write(Buffer.from([CAN]));
            socket.end();
        }
    });

    socket.on('end', () => {
        console.log('Client disconnected');
    });

    socket.on('error', err => {
        console.error('Socket error:', err);
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
